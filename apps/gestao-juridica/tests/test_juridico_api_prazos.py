"""Prazos, publicações e perda automática."""
from datetime import date, timedelta

import pytest

from juridico import cnj, db, prazos_servico, relogio


def _prazo(c, processo, **extra):
    corpo = {"processo_id": processo["id"], "descricao": "Contestação", "data_evento": "2024-03-04", "dias": 15,
             "evento": "disponibilizacao_dje", **extra}
    r = c.post("/api/prazos", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def test_prazo_calculado_guarda_memoria_e_data_fatal(advogado, processo):
    p = _prazo(advogado, processo)
    assert p["data_fatal"] == "2024-03-26" and "05/03/2024" in p["memoria_calculo"]
    assert p["data_interna"] == "2024-03-22"  # 2 dias úteis antes (sex 22)
    assert p["responsavel_id"] == advogado.usuario["id"]
    assert p["historico"][0]["acao"] == "criado"


def test_calculadora_nao_grava_nada(advogado, processo):
    r = advogado.post("/api/prazos/calcular", json={"data_evento": "2024-03-04", "dias": 15, "processo_id": processo["id"]})
    assert r.status_code == 200 and r.json()["data_fatal"] == "2024-03-26"
    assert advogado.get("/api/prazos").json() == []


def test_feriado_local_do_tribunal_empurra_o_prazo(advogado, processo):
    # Sem o feriado: 15 úteis de 06/03 vão até 26/03. Com feriado forense do TJSP em 07/03, vai a 27/03.
    assert advogado.post("/api/feriados", json={"data": "2024-03-07", "nome": "Suspensão do expediente", "escopo": "forense", "tribunal": "TJSP"}).status_code == 201
    assert _prazo(advogado, processo)["data_fatal"] == "2024-03-27"


def test_feriado_de_outro_tribunal_nao_afeta(advogado, processo):
    advogado.post("/api/feriados", json={"data": "2024-03-07", "nome": "Local", "escopo": "forense", "tribunal": "TJRS"})
    assert _prazo(advogado, processo)["data_fatal"] == "2024-03-26"


def test_prazo_manual_exige_data_fatal(advogado, processo):
    r = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Algo", "evento": "manual"})
    assert r.status_code == 422


def test_revisor_diferente_do_responsavel(advogado, novo_usuario, processo):
    r = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Recurso", "evento": "manual", "data_fatal": "2030-01-10",
                                           "revisor_id": advogado.usuario["id"]})
    assert r.status_code == 422


def test_quem_cumpre_manda_para_revisao_e_so_o_revisor_conclui(advogado, novo_usuario, processo):
    revisor = novo_usuario("advogado", "Rita Revisora")
    estag = novo_usuario("estagiario", "Eli Estagiario")
    p = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Apelação", "evento": "manual", "data_fatal": "2030-01-10",
                                           "responsavel_id": estag.usuario["id"], "revisor_id": revisor.usuario["id"]}).json()
    r = estag.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"}).json()
    assert r["status"] == "em_revisao" and r["concluido_em"] is None
    assert estag.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"}).status_code == 403
    r = revisor.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"}).json()
    assert r["status"] == "concluido" and r["concluido_por"] == revisor.usuario["id"]
    assert [h["para"] for h in r["historico"] if h["acao"] == "status"] == ["em_revisao", "concluido"]


def test_revisor_pode_devolver_para_ajuste(advogado, novo_usuario, processo):
    revisor = novo_usuario("advogado", "Rita Revisora")
    p = _prazo(advogado, processo, revisor_id=revisor.usuario["id"])
    advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"})
    assert revisor.post(f"/api/prazos/{p['id']}/status", json={"status": "em_andamento"}).json()["status"] == "em_andamento"


def test_perdido_so_o_sistema_marca_e_concluido_so_o_admin_reabre(advogado, admin, processo):
    p = _prazo(advogado, processo)
    assert advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "perdido"}).status_code == 422
    advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"})
    assert advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "pendente"}).status_code == 403
    assert admin.post(f"/api/prazos/{p['id']}/status", json={"status": "pendente"}).json()["status"] == "pendente"


def test_estagiario_nao_cancela_prazo(advogado, novo_usuario, processo):
    estag = novo_usuario("estagiario", "Eli Estagiario")
    p = _prazo(advogado, processo)
    assert estag.post(f"/api/prazos/{p['id']}/status", json={"status": "cancelado"}).status_code == 403


def test_prazo_vencido_sem_cumprir_vira_perdido_e_avisa(app, advogado, processo):
    ontem = (relogio.hoje() - timedelta(days=1)).isoformat()
    p = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Réplica", "evento": "manual", "data_fatal": ontem}).json()
    lista = advogado.get("/api/prazos").json()
    assert lista[0]["id"] == p["id"] and lista[0]["status"] == "perdido"
    con = db.conectar(app.state.caminho_banco)
    assert con.execute("SELECT COUNT(*) FROM alertas WHERE origem='prazo' AND antecedencia_dias=-1").fetchone()[0] >= 1
    con.close()


def test_prazo_em_revisao_vencido_nao_e_perdido_porque_o_trabalho_ja_foi_feito(advogado, novo_usuario, processo):
    revisor = novo_usuario("advogado", "Rita Revisora")
    ontem = (relogio.hoje() - timedelta(days=1)).isoformat()
    p = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Réplica", "evento": "manual", "data_fatal": ontem,
                                           "revisor_id": revisor.usuario["id"]}).json()
    # Cumprir antes de a rotina marcar como perdido: usa o serviço direto para simular o instante anterior.
    advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "em_revisao"})
    assert advogado.get(f"/api/prazos/{p['id']}").json()["status"] == "em_revisao"


def test_prazo_perdido_cumprido_em_atraso_fica_registrado(app, advogado, processo):
    ontem = (relogio.hoje() - timedelta(days=1)).isoformat()
    p = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": "Réplica", "evento": "manual", "data_fatal": ontem}).json()
    advogado.get("/api/prazos")
    r = advogado.post(f"/api/prazos/{p['id']}/status", json={"status": "concluido"}).json()
    assert r["status"] == "concluido" and "cumprido após a data fatal" in r["historico"][-1]["para"]


def test_mudar_data_fatal_exige_motivo_e_estagiario_nao_muda(advogado, novo_usuario, processo):
    estag = novo_usuario("estagiario", "Eli Estagiario")
    p = _prazo(advogado, processo)
    assert advogado.patch(f"/api/prazos/{p['id']}", json={"data_fatal": "2024-04-01"}).status_code == 422
    assert estag.patch(f"/api/prazos/{p['id']}", json={"data_fatal": "2024-04-01", "motivo": "porque sim"}).status_code == 403
    r = advogado.patch(f"/api/prazos/{p['id']}", json={"data_fatal": "2024-04-01", "motivo": "Suspensão por decisão"}).json()
    assert r["data_fatal"] == "2024-04-01"
    h = r["historico"][-1]
    assert "Suspensão por decisão" in h["acao"] and h["de"] == "2024-03-26" and h["para"] == "2024-04-01"


def test_filtros_de_lista_por_responsavel_status_e_periodo(advogado, novo_usuario, processo):
    outro = novo_usuario("advogado", "Beto Outro")
    def manual(desc, data, resp):  # datas futuras: prazo vencido viraria "perdido" e sairia do filtro `abertos`
        r = advogado.post("/api/prazos", json={"processo_id": processo["id"], "descricao": desc, "evento": "manual", "data_fatal": data, "responsavel_id": resp})
        return r.json()
    a = manual("Prazo A", "2030-03-26", advogado.usuario["id"])
    b = manual("Prazo B", "2030-05-06", outro.usuario["id"])
    ids = lambda **q: [p["id"] for p in advogado.get("/api/prazos", params=q).json()]  # noqa: E731
    assert ids(responsavel_id=outro.usuario["id"]) == [b["id"]]
    assert ids(de="2030-04-01") == [b["id"]]
    assert ids(ate="2030-04-01") == [a["id"]]
    advogado.post(f"/api/prazos/{a['id']}/status", json={"status": "concluido"})
    assert ids(abertos="true") == [b["id"]]


def test_prazo_de_processo_restrito_some_para_quem_nao_tem_acesso(advogado, novo_usuario, cliente):
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "restrito": True}).json()
    p = advogado.post("/api/prazos", json={"processo_id": r["id"], "descricao": "Sigiloso", "evento": "manual", "data_fatal": "2030-01-10"}).json()
    outro = novo_usuario("advogado", "Beto Outro")
    assert outro.get(f"/api/prazos/{p['id']}").status_code == 404
    assert outro.get("/api/prazos").json() == []


# ---------- publicações ----------
def _pub(numero, texto, data="2024-03-04", fonte="DJE"):
    return {"fonte": fonte, "data_disponibilizacao": data, "texto": f"Processo {numero}. {texto}"}


def test_publicacao_acha_o_processo_pelo_numero_sugere_prazo_e_nao_cria_sozinha(advogado, processo):
    r = advogado.post("/api/publicacoes/importar", json=[_pub(processo["numero"], "Cite-se o réu para, querendo, apresentar contestação.")])
    assert r.json() == {"novas": 1, "vinculadas": 1, "repetidas": 0}
    pub = advogado.get("/api/publicacoes").json()[0]
    assert pub["status"] == "vinculada" and pub["processo_id"] == processo["id"]
    assert (pub["sugestoes"][0]["chave"], pub["sugestoes"][0]["dias"]) == ("contestacao", 15)
    assert advogado.get("/api/prazos").json() == []  # sugestão não vira prazo sozinha
    andamentos = advogado.get(f"/api/processos/{processo['id']}/movimentacoes").json()
    assert andamentos[0]["origem"] == "publicacao"


def test_confirmar_sugestao_cria_prazo_com_data_do_dje(advogado, processo):
    advogado.post("/api/publicacoes/importar", json=[_pub(processo["numero"], "Apresentar contestação.")])
    pub = advogado.get("/api/publicacoes").json()[0]
    r = advogado.post(f"/api/publicacoes/{pub['id']}/criar-prazo", json={})
    assert r.status_code == 201
    prazo = advogado.get(f"/api/prazos/{r.json()['prazo_id']}").json()
    assert prazo["data_fatal"] == "2024-03-26" and prazo["base_legal"] == "CPC art. 335" and prazo["publicacao_id"] == pub["id"]
    assert advogado.get("/api/publicacoes").json()[0]["status"] == "tratada"


def test_importar_a_mesma_publicacao_duas_vezes_nao_duplica(advogado, processo):
    lote = [_pub(processo["numero"], "Apresentar contestação.")]
    advogado.post("/api/publicacoes/importar", json=lote)
    assert advogado.post("/api/publicacoes/importar", json=lote).json()["repetidas"] == 1
    assert len(advogado.get("/api/publicacoes").json()) == 1


def test_publicacao_de_processo_desconhecido_fica_nova_e_pode_ser_vinculada_a_mao(advogado, processo):
    outro_numero = cnj.gerar(777, 2021, 8, 26, 1)
    advogado.post("/api/publicacoes/importar", json=[_pub(outro_numero, "Intime-se para réplica no prazo de 10 dias.")])
    pub = advogado.get("/api/publicacoes").json()[0]
    assert pub["status"] == "nova" and pub["processo_id"] is None
    assert advogado.post(f"/api/publicacoes/{pub['id']}/criar-prazo", json={}).status_code == 422
    assert advogado.post(f"/api/publicacoes/{pub['id']}/vincular", json={"processo_id": processo["id"]}).json()["status"] == "vinculada"
    p = advogado.post(f"/api/publicacoes/{pub['id']}/criar-prazo", json={}).json()
    assert advogado.get(f"/api/prazos/{p['prazo_id']}").json()["dias"] == 10  # prazo do juízo vence o padrão


def test_numero_com_digito_errado_no_texto_nao_vincula(advogado, processo):
    errado = processo["numero"][:8] + "00" + processo["numero"][10:]
    advogado.post("/api/publicacoes/importar", json=[_pub(errado, "Apresentar contestação.")])
    assert advogado.get("/api/publicacoes").json()[0]["processo_id"] is None


def test_prazo_sugerido_pode_ser_corrigido_pelo_humano_antes_de_criar(advogado, processo):
    advogado.post("/api/publicacoes/importar", json=[_pub(processo["numero"], "Apresentar contestação.")])
    pub = advogado.get("/api/publicacoes").json()[0]
    p = advogado.post(f"/api/publicacoes/{pub['id']}/criar-prazo", json={"dias": 30, "dobro": False, "descricao": "Contestação (ajustada)"}).json()
    assert advogado.get(f"/api/prazos/{p['prazo_id']}").json()["dias"] == 30


@pytest.mark.parametrize("hoje_,esperado", [(date(2024, 3, 26), 0), (date(2024, 3, 20), 6)])
def test_dias_restantes(hoje_, esperado):
    assert prazos_servico.dias_ate("2024-03-26", hoje_) == esperado


def test_sugestao_usa_a_classe_do_processo_e_muda_ao_vincular(advogado, cliente, processo):
    fiscal = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": cnj.gerar(31, 2024, 8, 26, 114), "classe": "Execução Fiscal"}).json()
    texto = "Cite-se a executada para, querendo, apresentar embargos à execução."
    advogado.post("/api/publicacoes/importar", json=[_pub(fiscal["numero"], texto)])
    pub = advogado.get("/api/publicacoes").json()[0]
    assert (pub["sugestoes"][0]["dias"], pub["sugestoes"][0]["base_legal"]) == (30, "Lei 6.830/1980 (LEF) art. 16")
    # Sem número no texto: entra "nova" com o padrão do CPC; ao vincular a um processo comum a sugestão é reavaliada (15), ao fiscal vira 30.
    advogado.post("/api/publicacoes/importar", json=[{"fonte": "DJE", "data_disponibilizacao": "2024-03-05", "texto": "Sem numero. " + texto}])
    sem = next(p for p in advogado.get("/api/publicacoes").json() if p["processo_id"] is None)
    assert sem["sugestoes"][0]["dias"] == 15
    assert advogado.post(f"/api/publicacoes/{sem['id']}/vincular", json={"processo_id": fiscal["id"]}).json()["sugestoes"][0]["dias"] == 30
