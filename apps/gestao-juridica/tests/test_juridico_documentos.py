"""Documentos: upload, versão, busca no conteúdo, acesso, assinatura e modelos."""
import io
import zipfile

import pytest

from juridico import config, db, modelos, texto


def pdf_com_texto(txt: str) -> bytes:
    conteudo = f"BT /F1 12 Tf 72 720 Td ({txt}) Tj ET".encode()
    objs = [b"<</Type/Catalog/Pages 2 0 R>>", b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
            b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
            b"<</Length %d>>\nstream\n" % len(conteudo) + conteudo + b"\nendstream", b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"]
    out, offs = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    x = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    for o in offs:
        out += b"%010d 00000 n \n" % o
    return out + b"trailer\n<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, x)


def enviar(c, pasta_id, nome, dados, **form):
    return c.post(f"/api/pastas/{pasta_id}/documentos", files={"arquivo": (nome, dados, "application/octet-stream")}, data=form)


@pytest.fixture
def pasta(advogado, processo):
    return advogado.get(f"/api/processos/{processo['id']}/pastas").json()[1]["id"]  # "Documentos"


def achados(c, q, **extra):
    r = c.get("/api/documentos/busca", params={"q": q, **extra})
    assert r.status_code == 200, r.text
    return [x["nome"] for x in r.json()]


# ---------- upload e busca ----------
def test_busca_acha_o_conteudo_do_txt_sem_acento_e_por_prefixo(advogado, pasta):
    enviar(advogado, pasta, "laudo.txt", "Laudo pericial: a indenização por danos morais é devida.".encode())
    assert achados(advogado, "INDENIZACAO") == ["laudo.txt"]
    assert achados(advogado, "indeniz danos") == ["laudo.txt"]
    assert achados(advogado, "inexistente") == []


def test_busca_dentro_do_pdf(advogado, pasta):
    enviar(advogado, pasta, "contrato.pdf", pdf_com_texto("Contrato de locacao comercial entre as partes"))
    assert achados(advogado, "locacao comercial") == ["contrato.pdf"]


def test_busca_dentro_do_docx_gerado_pelo_sistema(advogado, pasta):
    docx = modelos.gerar_docx("# TÍTULO\nCláusula de confidencialidade vigente")
    enviar(advogado, pasta, "minuta.docx", docx)
    assert achados(advogado, "confidencialidade") == ["minuta.docx"]


def test_trecho_da_busca_vem_marcado_com_delimitadores_nao_html(advogado, pasta):
    enviar(advogado, pasta, "a.txt", b"<script>alert(1)</script> prova testemunhal")
    trecho = advogado.get("/api/documentos/busca", params={"q": "testemunhal"}).json()[0]["trecho"]
    assert "\x01testemunhal\x02" in trecho  # o front escapa o texto e só então troca os delimitadores por <mark>


def test_nova_versao_preserva_a_antiga_e_a_busca_so_enxerga_a_atual(advogado, pasta):
    d = enviar(advogado, pasta, "peticao.txt", b"versao antiga com palavra zebra").json()
    r = advogado.post(f"/api/documentos/{d['id']}/versoes", files={"arquivo": ("peticao.txt", b"versao nova com palavra girafa", "text/plain")},
                      data={"comentario": "revisão da Ana"})
    assert r.status_code == 201 and r.json()["versao_atual"] == 2
    det = advogado.get(f"/api/documentos/{d['id']}").json()
    assert [v["numero"] for v in det["versoes"]] == [2, 1] and det["versoes"][0]["comentario"] == "revisão da Ana"
    assert achados(advogado, "girafa") == ["peticao.txt"] and achados(advogado, "zebra") == []
    antiga = advogado.get(f"/api/documentos/versoes/{det['versoes'][1]['id']}/arquivo")
    assert antiga.content == b"versao antiga com palavra zebra"


def test_enviar_o_mesmo_arquivo_como_nova_versao_e_recusado(advogado, pasta):
    d = enviar(advogado, pasta, "a.txt", b"igual").json()
    r = advogado.post(f"/api/documentos/{d['id']}/versoes", files={"arquivo": ("a.txt", b"igual", "text/plain")})
    assert r.status_code == 409


def test_extensao_perigosa_arquivo_vazio_e_arquivo_grande_demais(advogado, pasta, monkeypatch):
    assert enviar(advogado, pasta, "virus.exe", b"MZ").status_code == 415
    assert enviar(advogado, pasta, "vazio.txt", b"").status_code == 422
    monkeypatch.setattr(config, "LIMITE_UPLOAD", 10)
    assert enviar(advogado, pasta, "grande.txt", b"x" * 11).status_code == 413


def test_nome_com_caminho_nao_escapa_do_armazenamento(advogado, pasta, app):
    r = enviar(advogado, pasta, "../../../etc/passwd.txt", b"conteudo").json()
    assert r["nome"] == "passwd.txt"
    raiz = config.dir_arquivos()
    # No disco só existem arquivos nomeados pelo hash, dentro do diretório de armazenamento.
    arquivos = [p for p in raiz.rglob("*") if p.is_file()]
    assert arquivos and all(len(p.name) == 64 and raiz in p.parents for p in arquivos)
    assert not list(raiz.parent.parent.rglob("passwd*"))


def test_download_vem_como_anexo_com_nosniff(advogado, pasta):
    d = enviar(advogado, pasta, "x.html", b"<script>alert(1)</script>").json()
    r = advogado.get(f"/api/documentos/versoes/{d['versao_id']}/arquivo")
    assert r.headers["content-disposition"].startswith("attachment") and r.headers["x-content-type-options"] == "nosniff"
    assert r.content == b"<script>alert(1)</script>"


def test_historico_registra_criacao_versao_e_download(advogado, admin, pasta):
    d = enviar(advogado, pasta, "a.txt", b"um").json()
    advogado.post(f"/api/documentos/{d['id']}/versoes", files={"arquivo": ("a.txt", b"dois", "text/plain")})
    advogado.get(f"/api/documentos/versoes/{d['versao_id']}/arquivo")
    acoes = [h["acao"] for h in advogado.get(f"/api/documentos/{d['id']}").json()["historico"]]
    assert acoes == ["download", "nova_versao", "criado"]
    assert admin.get("/api/auditoria", params={"entidade": "documento", "entidade_id": d["id"]}).status_code == 200


def test_excluir_e_reversivel_e_tira_da_busca(advogado, pasta):
    d = enviar(advogado, pasta, "a.txt", b"palavra rara quokka").json()
    assert advogado.delete(f"/api/documentos/{d['id']}").json()["desfazer"].endswith("/restaurar")
    assert achados(advogado, "quokka") == []
    assert advogado.get(f"/api/documentos/{d['id']}").status_code == 404
    assert advogado.post(f"/api/documentos/{d['id']}/restaurar").status_code == 200
    assert achados(advogado, "quokka") == ["a.txt"]


# ---------- acesso ----------
def test_documento_de_processo_restrito_nao_aparece_nem_na_busca(advogado, novo_usuario, cliente):
    p = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "restrito": True}).json()
    pasta_r = advogado.get(f"/api/processos/{p['id']}/pastas").json()[0]["id"]
    d = enviar(advogado, pasta_r, "sigilo.txt", b"segredo de justica narval").json()
    outro = novo_usuario("advogado", "Beto Outro")
    assert achados(outro, "narval") == []
    assert outro.get(f"/api/documentos/{d['id']}").status_code == 404
    assert outro.get(f"/api/documentos/versoes/{d['versao_id']}/arquivo").status_code == 404
    assert enviar(outro, pasta_r, "x.txt", b"intruso").status_code == 404


def test_financeiro_nao_acessa_documentos(novo_usuario, pasta):
    fin = novo_usuario("financeiro", "Fina Nanceira")
    assert fin.get("/api/documentos/busca", params={"q": "algo"}).status_code == 403
    assert enviar(fin, pasta, "a.txt", b"x").status_code == 403


def test_pastas_do_cliente_nascem_na_primeira_consulta(advogado, cliente):
    nomes = [p["nome"] for p in advogado.get(f"/api/clientes/{cliente['id']}/pastas").json()]
    assert nomes == ["Cadastro", "Procurações e Contratos"]


# ---------- assinatura ----------
def test_assinar_exige_senha_e_nao_assina_duas_vezes(advogado, pasta):
    d = enviar(advogado, pasta, "contrato.txt", b"contrato").json()
    url = f"/api/documentos/versoes/{d['versao_id']}/assinar"
    assert advogado.post(url, json={"senha": "errada"}).status_code == 401
    assert advogado.post(url, json={"senha": "senha-de-teste-123"}).status_code == 201
    assert advogado.post(url, json={"senha": "senha-de-teste-123"}).status_code == 409
    v = advogado.get(f"/api/documentos/versoes/{d['versao_id']}/verificar").json()
    assert v["integro"] and v["assinaturas"][0]["valida"] and v["assinaturas"][0]["nome"] == "Ana Advogada"


def test_arquivo_adulterado_invalida_a_assinatura(advogado, pasta):
    d = enviar(advogado, pasta, "contrato.txt", b"valor de 100 reais").json()
    advogado.post(f"/api/documentos/versoes/{d['versao_id']}/assinar", json={"senha": "senha-de-teste-123"})
    det = advogado.get(f"/api/documentos/{d['id']}").json()
    from juridico.api_documentos import caminho_arquivo
    caminho_arquivo(det["versoes"][0]["sha256"]).write_bytes(b"valor de 999 reais")  # troca o arquivo no disco
    v = advogado.get(f"/api/documentos/versoes/{d['versao_id']}/verificar").json()
    assert v["integro"] is False and v["assinaturas"][0]["valida"] is False


def test_registro_de_assinatura_adulterado_no_banco_nao_passa_na_verificacao(app, advogado, pasta):
    d = enviar(advogado, pasta, "contrato.txt", b"contrato").json()
    advogado.post(f"/api/documentos/versoes/{d['versao_id']}/assinar", json={"senha": "senha-de-teste-123"})
    con = db.conectar(app.state.caminho_banco)
    con.execute("UPDATE assinaturas SET nome='Outra Pessoa'")
    con.commit()
    con.close()
    assert advogado.get(f"/api/documentos/versoes/{d['versao_id']}/verificar").json()["assinaturas"][0]["valida"] is False


def test_assinatura_nao_vai_para_a_versao_nova(advogado, pasta):
    d = enviar(advogado, pasta, "c.txt", b"v1").json()
    advogado.post(f"/api/documentos/versoes/{d['versao_id']}/assinar", json={"senha": "senha-de-teste-123"})
    d2 = advogado.post(f"/api/documentos/{d['id']}/versoes", files={"arquivo": ("c.txt", b"v2", "text/plain")}).json()
    assert d2["assinaturas"] == 0


def test_link_de_assinatura_do_cliente_usa_uma_vez_e_valida_cpf(app, advogado, pasta):
    from fastapi.testclient import TestClient

    d = enviar(advogado, pasta, "procuracao.txt", b"poderes").json()
    conv = advogado.post(f"/api/documentos/versoes/{d['versao_id']}/solicitar-assinatura", json={"nome": "Maria da Silva"}).json()
    token = conv["token"]
    anonimo = TestClient(app)
    info = anonimo.get(f"/api/publico/assinatura/{token}").json()
    assert info["documento"] == "procuracao.txt" and info["signatario"] == "Maria da Silva"
    assert anonimo.get(f"/api/publico/assinatura/{token}/arquivo").content == b"poderes"
    corpo = {"nome": "Maria da Silva", "cpf": "529.982.247-25", "aceite": True}
    assert anonimo.post(f"/api/publico/assinatura/{token}", json=corpo | {"cpf": "111.111.111-11"}).status_code == 422
    assert anonimo.post(f"/api/publico/assinatura/{token}", json=corpo | {"aceite": False}).status_code == 422
    assert anonimo.post(f"/api/publico/assinatura/{token}", json=corpo).status_code == 201
    assert anonimo.post(f"/api/publico/assinatura/{token}", json=corpo).status_code == 410
    v = advogado.get(f"/api/documentos/versoes/{d['versao_id']}/verificar").json()
    assert v["assinaturas"][0]["metodo"] == "link" and v["assinaturas"][0]["valida"]


def test_token_nao_fica_em_claro_no_banco_e_link_expirado_ou_falso_da_404(app, advogado, pasta):
    from fastapi.testclient import TestClient

    d = enviar(advogado, pasta, "p.txt", b"x").json()
    token = advogado.post(f"/api/documentos/versoes/{d['versao_id']}/solicitar-assinatura", json={"nome": "Maria"}).json()["token"]
    con = db.conectar(app.state.caminho_banco)
    assert token not in str([tuple(r) for r in con.execute("SELECT * FROM solicitacoes_assinatura")])
    con.execute("UPDATE solicitacoes_assinatura SET expira_em='2000-01-01T00:00:00-03:00'")
    con.commit()
    con.close()
    anonimo = TestClient(app)
    assert anonimo.get(f"/api/publico/assinatura/{token}").status_code == 404
    assert anonimo.get("/api/publico/assinatura/token-inventado").status_code == 404


def test_estagiario_nao_assina_nem_solicita(novo_usuario, pasta, advogado):
    estag = novo_usuario("estagiario", "Eli Estagiario")
    d = enviar(advogado, pasta, "p.txt", b"x").json()
    assert estag.post(f"/api/documentos/versoes/{d['versao_id']}/assinar", json={"senha": "senha-de-teste-123"}).status_code == 403
    assert estag.post(f"/api/documentos/versoes/{d['versao_id']}/solicitar-assinatura", json={"nome": "Maria"}).status_code == 403


# ---------- modelos ----------
def test_modelo_nao_gera_com_lacuna_e_diz_o_que_falta(advogado, cliente):
    mid = next(m["id"] for m in advogado.get("/api/modelos").json() if m["nome"].startswith("Procuração"))
    r = advogado.post(f"/api/modelos/{mid}/gerar", json={"cliente_id": cliente["id"], "apenas_previa": True})
    assert r.status_code == 422
    assert r.json()["detail"]["faltando"] == ["escritorio.cidade"]
    ok = advogado.post(f"/api/modelos/{mid}/gerar", json={"cliente_id": cliente["id"], "apenas_previa": True, "extras": {"escritorio.cidade": "São Paulo"}})
    assert ok.status_code == 200
    t = ok.json()["texto"]
    assert "Maria da Silva" in t and "529.982.247-25" in t and "Ana Advogada" in t and "SP123456" in t and "{{" not in t


def test_gerar_com_processo_preenche_dados_do_processo_e_salva_docx_na_pasta(advogado, processo, pasta):
    advogado.post(f"/api/processos/{processo['id']}/partes", json={"nome": "Banco Réu S.A.", "polo": "passivo"})
    mid = next(m["id"] for m in advogado.get("/api/modelos").json() if m["nome"].startswith("Contrato"))
    r = advogado.post(f"/api/modelos/{mid}/gerar", json={"processo_id": processo["id"], "pasta_id": pasta})
    assert r.status_code == 200, r.text
    assert "1ª Vara Cível" in r.json()["texto"] and processo["numero"] in r.json()["texto"]
    doc = r.json()["documento"]
    assert doc["nome"].endswith(".docx")
    arq = advogado.get(f"/api/documentos/versoes/{doc['versao_id']}/arquivo").content
    with zipfile.ZipFile(io.BytesIO(arq)) as z:
        assert {"[Content_Types].xml", "_rels/.rels", "word/document.xml"} <= set(z.namelist())
    assert achados(advogado, "honorários advocatícios") == [doc["nome"]]


def test_modelo_com_variavel_desconhecida_e_recusado(advogado):
    r = advogado.post("/api/modelos", json={"nome": "Ruim", "corpo": "Olá {{ cliente.apelido }}, tudo bem?"})
    assert r.status_code == 422 and "cliente.apelido" in r.json()["detail"]


def test_variavel_de_valor_da_causa_sai_em_reais(advogado, cliente):
    p = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "tipo": "extrajudicial", "valor_causa_centavos": 123456789}).json()
    assert advogado.get(f"/api/processos/{p['id']}").json()["valor_causa_centavos"] == 123456789
    assert modelos._brl(123456789) == "1.234.567,89"


# ---------- extração de texto e OCR ----------
def test_imagem_sem_tesseract_entra_marcada_como_ocr_indisponivel(advogado, pasta, monkeypatch):
    monkeypatch.setattr(texto, "ocr_disponivel", lambda: False)
    d = enviar(advogado, pasta, "scan.png", b"\x89PNG\r\n\x1a\nfake").json()
    assert d["ocr_status"] == "indisponivel"


def test_imagem_com_ocr_vira_texto_pesquisavel(advogado, pasta, monkeypatch):
    monkeypatch.setattr(texto, "ocr_disponivel", lambda: True)
    monkeypatch.setattr(texto, "_ocr_imagem", lambda p: "Recibo de pagamento emitido em marco")
    d = enviar(advogado, pasta, "recibo.png", b"\x89PNG\r\n\x1a\nfake").json()
    assert d["ocr_status"] == "feito" and achados(advogado, "recibo pagamento") == ["recibo.png"]


def test_pdf_sem_camada_de_texto_cai_no_ocr_e_sem_ocr_fica_indisponivel(advogado, pasta, monkeypatch):
    escaneado = pdf_com_texto("")
    monkeypatch.setattr(texto, "ocr_disponivel", lambda: False)
    assert enviar(advogado, pasta, "escaneado.pdf", escaneado).json()["ocr_status"] == "indisponivel"
    monkeypatch.setattr(texto, "ocr_disponivel", lambda: True)
    monkeypatch.setattr(texto, "_ocr_pdf", lambda p: "Texto lido do escaneado")
    assert enviar(advogado, pasta, "escaneado2.pdf", escaneado + b"\n%x").json()["ocr_status"] == "feito"


def test_pdf_corrompido_nao_derruba_o_upload(advogado, pasta):
    r = enviar(advogado, pasta, "quebrado.pdf", b"%PDF-1.4 isto nao e um pdf")
    assert r.status_code == 201 and r.json()["ocr_status"] in {"falhou", "indisponivel"}
