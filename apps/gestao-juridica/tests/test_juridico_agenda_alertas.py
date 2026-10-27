"""Agenda (dia/semana/mês + filtros) e alertas (idempotência, canais, obsolescência)."""
from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from juridico import alertas, ciclo, db, relogio
from juridico.api_agenda import intervalo


# ---------- intervalos ----------
def test_intervalos_de_dia_semana_e_mes():
    qua = date(2024, 3, 6)
    assert intervalo("dia", qua) == (qua, qua)
    assert intervalo("semana", qua) == (date(2024, 3, 4), date(2024, 3, 10))  # segunda a domingo
    assert intervalo("mes", date(2024, 2, 10)) == (date(2024, 2, 1), date(2024, 2, 29))  # bissexto
    with pytest.raises(HTTPException):
        intervalo("ano", qua)


def _evento(c, **extra):
    corpo = {"tipo": "audiencia", "titulo": "Audiência de instrução", "inicio": "2024-03-06T14:00:00", **extra}
    r = c.post("/api/eventos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def _titulos(c, **q):
    return [i["titulo"] for i in c.get("/api/agenda", params=q).json()["itens"]]


def test_agenda_mostra_evento_e_prazo_do_mesmo_periodo(advogado, processo):
    _evento(advogado, processo_id=processo["id"])
    advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Contestação", "evento": "manual", "data_fatal": "2024-03-08"})
    itens = advogado.get("/api/agenda", params={"visao": "semana", "data": "2024-03-06"}).json()["itens"]
    assert [(i["origem"], i["tipo"]) for i in itens] == [("evento", "audiencia"), ("prazo", "prazo")]
    assert itens[0]["cliente_nome"] == "Maria da Silva" and itens[0]["processo_numero"] == processo["numero"]


def test_agenda_dia_nao_traz_o_vizinho_e_mes_traz_tudo(advogado):
    _evento(advogado, titulo="Dia 6", inicio="2024-03-06T10:00:00")
    _evento(advogado, titulo="Dia 7", inicio="2024-03-07T10:00:00", tipo="reuniao")
    assert _titulos(advogado, visao="dia", data="2024-03-06") == ["Dia 6"]
    assert _titulos(advogado, visao="mes", data="2024-03-20") == ["Dia 6", "Dia 7"]


def test_agenda_filtra_por_advogado_cliente_processo_e_tipo(advogado, novo_usuario, processo):
    outro = novo_usuario("advogado", "Beto Outro")
    _evento(advogado, titulo="Do Ana", processo_id=processo["id"])
    _evento(advogado, titulo="Do Beto", responsavel_id=outro.usuario["id"], tipo="pericia")
    q = {"visao": "mes", "data": "2024-03-10"}
    assert _titulos(advogado, **q, advogado_id=outro.usuario["id"]) == ["Do Beto"]
    assert _titulos(advogado, **q, processo_id=processo["id"]) == ["Do Ana"]
    assert _titulos(advogado, **q, cliente_id=processo["cliente_id"]) == ["Do Ana"]  # cliente herdado do processo
    assert _titulos(advogado, **q, tipos="pericia") == ["Do Beto"]


def test_evento_de_processo_restrito_nao_aparece_para_outro_advogado(advogado, novo_usuario, cliente):
    p = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "restrito": True}).json()
    _evento(advogado, titulo="Sigiloso", processo_id=p["id"])
    outro = novo_usuario("advogado", "Beto Outro")
    assert _titulos(outro, visao="mes", data="2024-03-10") == []
    assert outro.post("/api/eventos", json={"tipo": "reuniao", "titulo": "Intruso", "inicio": "2024-03-06T10:00:00", "processo_id": p["id"]}).status_code == 404


def test_vencimento_financeiro_exige_valor_e_financeiro_so_ve_o_financeiro(advogado, novo_usuario):
    fin = novo_usuario("financeiro", "Fina Nanceira")
    assert advogado.post("/api/eventos", json={"tipo": "vencimento_financeiro", "titulo": "Honorários", "inicio": "2024-03-10", "dia_inteiro": True}).status_code == 422
    r = fin.post("/api/eventos", json={"tipo": "vencimento_financeiro", "titulo": "Honorários Maria", "inicio": "2024-03-10", "dia_inteiro": True, "valor_centavos": 150000})
    assert r.status_code == 201 and r.json()["inicio"] == "2024-03-10"
    _evento(advogado, titulo="Audiência")
    assert _titulos(fin, visao="mes", data="2024-03-10") == ["Honorários Maria"]
    assert fin.post("/api/eventos", json={"tipo": "audiencia", "titulo": "x" * 3, "inicio": "2024-03-06T10:00:00"}).status_code == 403


def test_evento_com_fim_antes_do_inicio_e_recusado(advogado):
    r = advogado.post("/api/eventos", json={"tipo": "reuniao", "titulo": "Reunião", "inicio": "2024-03-06T10:00:00", "fim": "2024-03-06T09:00:00"})
    assert r.status_code == 422


def test_estagiario_so_apaga_evento_proprio(advogado, novo_usuario):
    estag = novo_usuario("estagiario", "Eli Estagiario")
    e = _evento(advogado, titulo="Do advogado")
    assert estag.delete(f"/api/eventos/{e['id']}").status_code == 403
    proprio = _evento(estag, titulo="Do estagiário", tipo="diligencia")
    assert estag.delete(f"/api/eventos/{proprio['id']}").status_code == 200


# ---------- alertas ----------
@pytest.fixture
def con(app):
    c = db.conectar(app.state.caminho_banco)
    yield c
    c.commit()
    c.close()


def _prazo_em(advogado, processo, dias_a_frente):
    fatal = (relogio.hoje() + timedelta(days=dias_a_frente)).isoformat()
    return advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Réplica", "evento": "manual", "data_fatal": fatal}).json()


def _n(con, **where):
    cond = " AND ".join(f"{k}=?" for k in where) or "1=1"
    return con.execute(f"SELECT COUNT(*) FROM alertas WHERE {cond}", tuple(where.values())).fetchone()[0]


def test_alertas_nascem_por_antecedencia_e_canal_e_nao_duplicam(advogado, processo, con):
    _prazo_em(advogado, processo, 10)  # 7, 3, 1 e 0 dias antes ainda estão no futuro
    gerados = alertas.gerar_alertas(con)
    assert gerados == 8  # 4 antecedências x (app + email)
    assert alertas.gerar_alertas(con) == 0  # rodar de novo no mesmo dia não repete


def test_prazo_perto_nao_gera_alerta_no_passado(advogado, processo, con):
    _prazo_em(advogado, processo, 2)  # 7 e 3 dias antes já passaram
    alertas.gerar_alertas(con)
    assert sorted(r[0] for r in con.execute("SELECT DISTINCT antecedencia_dias FROM alertas")) == [0, 1]


def test_whatsapp_so_para_quem_tem_telefone(advogado, admin, processo, con):
    admin.patch(f"/api/usuarios/{advogado.usuario['id']}", json={"canais_alerta": "app,whatsapp"})
    _prazo_em(advogado, processo, 1)
    alertas.gerar_alertas(con)
    con.commit()  # solta o lock de escrita do SQLite antes de a API escrever
    assert _n(con, canal="whatsapp") == 0
    admin.patch(f"/api/usuarios/{advogado.usuario['id']}", json={"telefone": "+5511999990000"})
    alertas.gerar_alertas(con)
    assert _n(con, canal="whatsapp") > 0


def test_canal_invalido_e_recusado(admin, advogado):
    assert admin.patch(f"/api/usuarios/{advogado.usuario['id']}", json={"canais_alerta": "sms"}).status_code == 422


def test_entrega_app_vira_enviado_e_email_sem_provedor_fica_visivel(advogado, processo, con):
    _prazo_em(advogado, processo, 0)
    alertas.gerar_alertas(con)
    depois = relogio.agora() + timedelta(days=1)
    r = alertas.entregar_alertas(con, depois, enviadores={"email": None, "whatsapp": None})
    assert r["enviado"] == 1 and r["sem_provedor"] == 1  # app entregue; e-mail sem SMTP NÃO é dado como enviado
    assert _n(con, canal="email", status="sem_provedor") == 1


def test_entrega_por_email_com_provedor_e_falha_registrada(advogado, processo, con):
    _prazo_em(advogado, processo, 0)
    alertas.gerar_alertas(con)
    depois = relogio.agora() + timedelta(days=1)
    enviados = []
    alertas.entregar_alertas(con, depois, enviadores={"email": lambda u, a, t: enviados.append((u["email"], t))})
    assert enviados and "Réplica" in enviados[0][1]

    con.execute("UPDATE alertas SET status='pendente' WHERE canal='email'")

    def quebra(*_):
        raise OSError("SMTP fora do ar")
    r = alertas.entregar_alertas(con, depois, enviadores={"email": quebra})
    assert r["falhou"] == 1
    assert "SMTP fora do ar" in con.execute("SELECT erro FROM alertas WHERE canal='email'").fetchone()[0]


def test_prazo_cumprido_cancela_alertas_que_ainda_nao_foram_enviados(advogado, processo, con):
    p = _prazo_em(advogado, processo, 5)
    alertas.gerar_alertas(con)
    con.commit()
    advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"})
    r = alertas.entregar_alertas(con, relogio.agora() + timedelta(days=30), enviadores={})
    assert r["obsoleto"] > 0 and _n(con, origem="prazo") == 0


def test_alerta_de_evento_na_vespera(advogado, con):
    amanha = (relogio.hoje() + timedelta(days=1)).isoformat()
    advogado.post("/api/eventos", json={"tipo": "audiencia", "titulo": "Audiência X", "inicio": f"{amanha}T14:00:00", "local": "Fórum Central"})
    alertas.gerar_alertas(con)
    msg = con.execute("SELECT mensagem FROM alertas WHERE origem='evento' AND antecedencia_dias=1 AND canal='app'").fetchone()[0]
    assert "Audiência X amanhã" in msg and "14:00" in msg and "Fórum Central" in msg


def test_caixa_de_entrada_do_app_marca_como_lido(advogado, processo, con):
    _prazo_em(advogado, processo, 0)
    alertas.gerar_alertas(con)
    alertas.entregar_alertas(con, relogio.agora() + timedelta(days=1), enviadores={})
    con.commit()
    caixa = advogado.get("/api/alertas").json()
    assert len(caixa) == 1 and advogado.get("/api/painel").json()["alertas_nao_lidos"] == 1
    advogado.post(f"/api/alertas/{caixa[0]['id']}/lido")
    assert advogado.get("/api/alertas").json() == [] and advogado.get("/api/painel").json()["alertas_nao_lidos"] == 0


def test_ciclo_diario_roda_tudo_e_e_idempotente(advogado, processo, con):
    _prazo_em(advogado, processo, 1)
    resposta = {"hits": {"hits": [{"_source": {"movimentos": [{"codigo": 1, "nome": "Citação", "dataHora": "2024-03-01T13:00:00Z"}]}}]}}
    con.commit()
    r1 = ciclo.rodar(con, transporte=lambda *_: resposta, enviadores={})
    assert r1["datajud"] == {"processos": 1, "andamentos_novos": 1, "erros": 0} and r1["alertas_novos"] > 0
    r2 = ciclo.rodar(con, transporte=lambda *_: resposta, enviadores={})
    assert r2["datajud"]["andamentos_novos"] == 0 and r2["alertas_novos"] == 0


def test_painel_mostra_prazo_de_hoje_da_semana_e_o_que_espera_minha_revisao(advogado, novo_usuario, processo):
    revisor = novo_usuario("advogado", "Rita Revisora")
    _prazo_em(advogado, processo, 0)
    _prazo_em(advogado, processo, 3)
    p = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Para revisar", "evento": "manual",
                                           "data_fatal": (relogio.hoje() + timedelta(days=20)).isoformat(), "revisor_id": revisor.usuario["id"]}).json()
    advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"})
    pn = advogado.get("/api/painel").json()
    assert len(pn["prazos_hoje"]) == 1 and len(pn["prazos_semana"]) == 1
    assert [x["descricao"] for x in revisor.get("/api/painel").json()["aguardando_minha_revisao"]] == ["Para revisar"]


def test_dados_de_demonstracao_passam_pelas_regras_da_api(admin):
    from juridico.demo import semear

    r = semear(admin)
    assert r["processos"] == 5 and r["clientes"] == 3
    assert len(admin.get("/api/processos").json()) == 5
    pn = admin.get("/api/painel").json()
    assert pn["prazos_hoje"] and pn["publicacoes_novas"] == 3
