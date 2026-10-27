"""Processos, clientes, acesso, andamentos e vínculos."""
from juridico import cnj, datajud

CNJ = cnj.gerar(1234567, 2023, 8, 26, 100)


def test_api_exige_login(app):
    from fastapi.testclient import TestClient

    c = TestClient(app)
    assert c.get("/api/processos").status_code == 401
    assert c.get("/api/painel").status_code == 401


def test_login_com_senha_errada_e_bloqueio_apos_cinco_tentativas(app):
    from fastapi.testclient import TestClient

    c = TestClient(app)
    for _ in range(5):
        assert c.post("/api/login", json={"email": "admin@teste.local", "senha": "errada"}).status_code == 401
    assert c.post("/api/login", json={"email": "admin@teste.local", "senha": "errada"}).status_code == 429


def test_trocar_a_senha_derruba_a_sessao_antiga(admin, app):
    from tests.conftest import SENHA  # noqa: F401

    uid = admin.get("/api/eu").json()["id"]
    assert admin.patch(f"/api/usuarios/{uid}", json={"senha": "outra-senha-longa-1"}).status_code == 200
    assert admin.get("/api/eu").status_code == 401


def test_cliente_com_cpf_invalido_e_recusado_e_duplicado_nao_entra(advogado, cliente):
    r = advogado.post("/api/clientes", json={"tipo_pessoa": "PF", "nome": "Fulano", "documento": "111.111.111-11"})
    assert r.status_code == 422
    dup = advogado.post("/api/clientes", json={"tipo_pessoa": "PF", "nome": "Outra Maria", "documento": "52998224725"})
    assert dup.status_code == 409 and "Maria da Silva" in dup.json()["detail"]


def test_pessoa_juridica_exige_cnpj(advogado):
    assert advogado.post("/api/clientes", json={"tipo_pessoa": "PJ", "nome": "ACME", "documento": "529.982.247-25"}).status_code == 422
    assert advogado.post("/api/clientes", json={"tipo_pessoa": "PJ", "nome": "ACME", "documento": "11.222.333/0001-81"}).status_code == 201


def test_processo_com_digito_verificador_errado_e_recusado(advogado, cliente):
    ruim = CNJ[:8] + f"{(int(CNJ[8:10]) + 1) % 100:02d}" + CNJ[10:]
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": ruim})
    assert r.status_code == 422 and "dígito verificador" in r.json()["detail"]


def test_processo_cnj_preenche_tribunal_e_cria_pastas_padrao(advogado, processo):
    assert processo["tribunal"] == "TJSP" and processo["uf"] == "SP" and processo["numero"] == CNJ
    pastas = advogado.get(f"/api/processos/{processo['id']}/pastas").json()
    assert [p["nome"] for p in pastas] == ["Petição Inicial", "Documentos", "Provas", "Decisões", "Recursos"]


def test_numero_repetido_e_recusado_mesmo_sem_pontuacao(advogado, cliente, processo):
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": CNJ.replace("-", "").replace(".", "")})
    assert r.status_code == 409


def test_numeracao_antiga_aceita_com_flag_e_extrajudicial_dispensa_numero(advogado, cliente):
    assert advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": "123/1998", "numero_legado": True}).status_code == 201
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "assunto": "Notificação de dívida"})
    assert r.status_code == 201 and r.json()["fase"] == "Negociação"
    adm = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "administrativo", "numero": "INSS 44233.1/2024"})
    assert adm.status_code == 201 and adm.json()["fase"] == "Protocolo"


def test_fase_de_outro_tipo_e_recusada_e_mudanca_vira_historico(advogado, processo):
    assert advogado.patch(f"/api/processos/{processo['id']}", json={"fase": "Negociação"}).status_code == 422
    r = advogado.patch(f"/api/processos/{processo['id']}", json={"fase": "Sentença"}).json()
    assert [f["fase"] for f in r["fases_historico"]] == ["Conhecimento", "Sentença"]


def test_busca_acha_por_cpf_formatado_ou_nao_numero_parte_e_assunto_sem_acento(advogado, processo):
    advogado.post(f"/api/processos/{processo['id']}/partes", json={"nome": "José Ávila Comércio", "polo": "passivo", "documento": "11.222.333/0001-81"})
    def achou(q):
        return [p["id"] for p in advogado.get("/api/processos", params={"q": q}).json()]
    assert achou("529.982.247-25") == achou("52998224725") == [processo["id"]]
    assert achou("1234567") == [processo["id"]]
    assert achou("jose avila") == [processo["id"]]
    assert achou("INDENIZACAO") == [processo["id"]]
    assert achou("11222333000181") == [processo["id"]]
    assert achou("inexistente") == []


def test_processo_restrito_e_404_para_quem_nao_e_responsavel(advogado, novo_usuario, cliente, admin):
    outro = novo_usuario("advogado", "Beto Outro")
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": cnj.gerar(9, 2022, 8, 26, 1), "restrito": True})
    pid = r.json()["id"]
    assert outro.get(f"/api/processos/{pid}").status_code == 404
    assert pid not in [p["id"] for p in outro.get("/api/processos").json()]
    assert admin.get(f"/api/processos/{pid}").status_code == 200
    assert advogado.get(f"/api/processos/{pid}").status_code == 200


def test_financeiro_nao_cria_processo(novo_usuario, cliente):
    fin = novo_usuario("financeiro", "Fina Nanceira")
    assert fin.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial"}).status_code == 403


def test_importar_andamentos_duas_vezes_nao_duplica(advogado, processo):
    itens = [{"data": "2024-03-01", "descricao": "Distribuição por sorteio"}, {"data": "2024-03-05", "descricao": "Citação expedida"}]
    url = f"/api/processos/{processo['id']}/movimentacoes/importar"
    assert advogado.post(url, json=itens).json() == {"inseridos": 2, "ignorados": 0}
    assert advogado.post(url, json=itens).json() == {"inseridos": 0, "ignorados": 2}
    movs = advogado.get(f"/api/processos/{processo['id']}/movimentacoes").json()
    assert [m["data"] for m in movs] == ["2024-03-05", "2024-03-01"] and movs[0]["origem"] == "automatica"


def test_vinculo_entre_processos_aparece_nos_dois_lados_e_nao_duplica_invertido(advogado, cliente, processo):
    b = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": cnj.gerar(2, 2024, 8, 26, 100)}).json()
    assert advogado.post(f"/api/processos/{processo['id']}/vinculos", json={"outro_id": b["id"], "tipo": "recurso"}).status_code == 201
    assert advogado.post(f"/api/processos/{b['id']}/vinculos", json={"outro_id": processo["id"], "tipo": "conexao"}).status_code == 409
    assert advogado.post(f"/api/processos/{b['id']}/vinculos", json={"outro_id": b["id"]}).status_code == 422
    da = advogado.get(f"/api/processos/{processo['id']}").json()["vinculos"]
    db_ = advogado.get(f"/api/processos/{b['id']}").json()["vinculos"]
    assert da[0]["outro"]["id"] == b["id"] and db_[0]["outro"]["id"] == processo["id"]


def test_responsavel_inexistente_e_recusado(advogado, cliente):
    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "responsaveis": [9999]})
    assert r.status_code == 422


# ---------- DataJud (sem rede) ----------
RESPOSTA = {"hits": {"hits": [{"_source": {"movimentos": [
    {"codigo": 26, "nome": "Distribuição", "dataHora": "2024-03-01T13:00:00.000Z"},
    {"codigo": 123, "nome": "Juntada", "dataHora": "2024-03-02T02:30:00.000Z", "complementosTabelados": [{"descricao": "de petição"}]},
]}}]}}


def test_datajud_converte_movimentos_para_data_de_brasilia():
    movs = datajud.extrair_movimentos(RESPOSTA)
    # 02/03 02:30 UTC ainda é 01/03 23:30 em Brasília.
    assert movs[0]["data"] == "2024-03-01" and movs[0]["descricao"] == "Juntada — de petição"


def test_datajud_alias_por_tribunal():
    assert datajud.alias(cnj.interpretar(cnj.gerar(1, 2023, 8, 26, 1))) == "tjsp"
    assert datajud.alias(cnj.interpretar(cnj.gerar(1, 2023, 4, 4, 1))) == "trf4"
    assert datajud.alias(cnj.interpretar(cnj.gerar(1, 2023, 5, 2, 1))) == "trt2"


def test_consultar_datajud_sem_chave_explica_o_que_falta(advogado, processo):
    r = advogado.post(f"/api/processos/{processo['id']}/consultar-datajud")
    assert r.status_code == 502 and "DATAJUD_API_KEY" in r.json()["detail"]


def test_atualizar_do_datajud_grava_andamentos_sem_duplicar(app, advogado, processo):
    from juridico import db
    from juridico.api_processos import atualizar_do_datajud

    con = db.conectar(app.state.caminho_banco)
    p = con.execute("SELECT * FROM processos WHERE id=?", (processo["id"],)).fetchone()
    visto = {}

    def falso(url, cab, corpo):
        visto.update(url=url, cab=cab, corpo=corpo)
        return RESPOSTA

    import os
    os.environ["DATAJUD_API_KEY"] = "chave-de-teste"
    try:
        assert atualizar_do_datajud(con, p, transporte=falso)["inseridos"] == 2
        assert atualizar_do_datajud(con, p, transporte=falso)["inseridos"] == 0
    finally:
        del os.environ["DATAJUD_API_KEY"]
    assert visto["url"].endswith("/api_publica_tjsp/_search") and visto["corpo"]["query"]["match"]["numeroProcesso"] == p["numero_digitos"]
    con.close()


def test_usuario_muda_os_proprios_canais_e_a_senha_exige_a_atual(advogado):
    r = advogado.patch("/api/eu", json={"canais_alerta": "app", "telefone": "+5511988887777"})
    assert r.status_code == 200 and r.json()["canais_alerta"] == "app" and r.json()["telefone"] == "+5511988887777"
    assert advogado.patch("/api/eu", json={"senha_nova": "nova-senha-longa-1", "senha_atual": "errada"}).status_code == 401
    assert advogado.patch("/api/eu", json={"canais_alerta": "pombo"}).status_code == 422
    assert advogado.patch("/api/eu", json={"senha_nova": "nova-senha-longa-1", "senha_atual": "senha-de-teste-123"}).status_code == 200
    assert advogado.get("/api/eu").status_code == 401  # senha mudou: a sessão antiga cai
