"""Dados fictícios para conhecer o sistema (nomes, CPFs e processos inventados).

    LEGAL_ADMIN_EMAIL=admin@demo.local LEGAL_ADMIN_SENHA=... python -m juridico.demo

Usa a própria API (TestClient), então passa pelas mesmas regras de validação da produção.
Precisa de `httpx` (requirements-dev.txt). Rodar em banco que já tem dados é recusado.
"""
from __future__ import annotations

import os
import sys
from datetime import timedelta

from . import cnj, relogio


def cpf_de(base9: str) -> str:
    """Completa 9 dígitos com os dois verificadores (CPF sintético válido)."""
    d = [int(x) for x in base9]
    for tam in (9, 10):
        d.append((sum(d[i] * (tam + 1 - i) for i in range(tam)) * 10 % 11) % 10)
    return "".join(map(str, d))


def semear(c) -> dict:
    """`c` é um cliente HTTP já autenticado como administrador."""
    h = relogio.hoje()
    iso = lambda dias: (h + timedelta(days=dias)).isoformat()  # noqa: E731
    ok = lambda r: (r.raise_for_status(), r.json())[1]  # noqa: E731
    senha = os.environ.get("LEGAL_DEMO_SENHA", "demonstracao-123")
    bia = ok(c.post("/api/usuarios", json={"nome": "Beatriz Moraes", "email": "beatriz@demo.local", "senha": senha, "papel": "advogado", "oab": "OAB/SP 123.456"}))
    caio = ok(c.post("/api/usuarios", json={"nome": "Caio Nogueira", "email": "caio@demo.local", "senha": senha, "papel": "advogado", "oab": "OAB/SP 234.567"}))
    ester = ok(c.post("/api/usuarios", json={"nome": "Ester Lima", "email": "ester@demo.local", "senha": senha, "papel": "estagiario"}))
    ok(c.post("/api/usuarios", json={"nome": "Fábio Rocha", "email": "fabio@demo.local", "senha": senha, "papel": "financeiro"}))

    cli = [ok(c.post("/api/clientes", json=x)) for x in [
        {"tipo_pessoa": "PF", "nome": "Helena Ribeiro Duarte", "documento": cpf_de("390533447"), "email": "helena@exemplo.com", "telefone": "(11) 98888-1111", "endereco": "Rua das Acácias, 120, São Paulo/SP"},
        {"tipo_pessoa": "PJ", "nome": "Padaria Pão Quente Ltda.", "documento": "11.222.333/0001-81", "email": "contato@paoquente.example", "telefone": "(11) 3333-2222", "endereco": "Av. Brasil, 900, Campinas/SP"},
        {"tipo_pessoa": "PF", "nome": "Otávio Menezes Filho", "documento": cpf_de("123456789"), "email": "otavio@exemplo.com", "endereco": "Rua do Comércio, 45, Santos/SP"},
    ]]
    proc = lambda **k: ok(c.post("/api/processos", json=k))  # noqa: E731
    p1 = proc(cliente_id=cli[0]["id"], numero=cnj.gerar(1000123, 2024, 8, 26, 100), vara="3ª Vara Cível", comarca="São Paulo", classe="Procedimento Comum Cível",
              assunto="Indenização por danos morais — negativação indevida", polo_cliente="ativo", fase="Instrução", valor_causa_centavos=2500000,
              data_distribuicao=iso(-200), responsaveis=[bia["id"], ester["id"]])
    p2 = proc(cliente_id=cli[1]["id"], numero=cnj.gerar(2000456, 2023, 5, 2, 15), vara="15ª Vara do Trabalho", comarca="São Paulo", classe="Reclamação Trabalhista",
              assunto="Verbas rescisórias", polo_cliente="passivo", fase="Recursal", valor_causa_centavos=8000000, responsaveis=[caio["id"]])
    p3 = proc(cliente_id=cli[1]["id"], numero=cnj.gerar(3000789, 2024, 8, 26, 114), vara="2ª Vara de Execuções Fiscais", comarca="Campinas", classe="Execução Fiscal",
              assunto="ICMS — embargos à execução", polo_cliente="passivo", fase="Cumprimento/Execução", responsaveis=[bia["id"]])
    p4 = proc(cliente_id=cli[2]["id"], tipo="extrajudicial", assunto="Notificação de cobrança de aluguéis", polo_cliente="ativo", responsaveis=[caio["id"]])
    p5 = proc(cliente_id=cli[0]["id"], tipo="administrativo", numero="INSS 44233.123456/2024-11", assunto="Aposentadoria por tempo de contribuição", fase="Análise", responsaveis=[bia["id"]])
    ok(c.post(f"/api/processos/{p1['id']}/vinculos", json={"outro_id": p3["id"], "tipo": "conexao", "observacao": "Mesma origem dos fatos"}))
    for pid, nome, polo, papel, extra in [(p1["id"], "Banco Alfa S.A.", "passivo", "parte", {"documento": "11.222.333/0001-81"}), (p1["id"], "Dr. Ricardo Pires", "passivo", "advogado", {"oab": "OAB/SP 98.765"}),
                                          (p2["id"], "Marcos Aurélio Souza", "ativo", "parte", {}), (p3["id"], "Fazenda do Estado de São Paulo", "ativo", "parte", {})]:
        ok(c.post(f"/api/processos/{pid}/partes", json={"nome": nome, "polo": polo, "papel": papel, **extra}))
    for d, t in [(-190, "Distribuição por sorteio"), (-180, "Citação expedida"), (-150, "Juntada de contestação"), (-60, "Decisão saneadora e designação de audiência"), (-5, "Juntada de laudo pericial")]:
        ok(c.post(f"/api/processos/{p1['id']}/movimentacoes", json={"data": iso(d), "descricao": t}))

    def prazo(proc_, desc, fatal, **k):
        return ok(c.post("/api/prazos", json={"processo_id": proc_["id"], "descricao": desc, "evento": "manual", "data_fatal": iso(fatal), **k}))
    prazo(p1, "Manifestação sobre o laudo pericial", 0, responsavel_id=bia["id"], base_legal="CPC art. 477 §1º")
    prazo(p1, "Memoriais finais", 6, responsavel_id=ester["id"], revisor_id=bia["id"])
    prazo(p2, "Contrarrazões ao recurso ordinário", 2, responsavel_id=caio["id"], base_legal="CLT art. 900")
    prazo(p3, "Embargos à execução", 11, responsavel_id=bia["id"], base_legal="LEF art. 16")
    concluido = prazo(p4, "Notificar locatário", 3, responsavel_id=caio["id"])
    ok(c.post(f"/api/prazos/{concluido['id']}/status", json={"status": "concluido"}))
    r = prazo(p5, "Juntar CNIS atualizado", 9, responsavel_id=ester["id"], revisor_id=bia["id"])
    ok(c.post(f"/api/prazos/{r['id']}/status", json={"status": "concluido"}))  # vai para revisão da Beatriz
    calc = ok(c.post("/api/prazos", json={"processo_id": p2["id"], "descricao": "Recurso ordinário (calculado)", "evento": "disponibilizacao_dje", "data_evento": iso(1), "dias": 8,
                                          "responsavel_id": caio["id"], "base_legal": "CLT arts. 775 e 895"}))

    def evento(tipo, titulo, dias, hora, **k):
        return ok(c.post("/api/eventos", json={"tipo": tipo, "titulo": titulo, "inicio": f"{iso(dias)}T{hora}", **k}))
    evento("audiencia", "Audiência de instrução — Helena x Banco Alfa", 4, "14:00:00", processo_id=p1["id"], local="Fórum João Mendes, sala 412", responsavel_id=bia["id"])
    evento("reuniao", "Reunião com cliente (Padaria Pão Quente)", 1, "10:30:00", cliente_id=cli[1]["id"], responsavel_id=caio["id"], local="Escritório")
    evento("sustentacao_oral", "Sustentação oral — TRT-2", 9, "09:00:00", processo_id=p2["id"], responsavel_id=caio["id"])
    evento("pericia", "Perícia contábil", 12, "15:00:00", processo_id=p3["id"], responsavel_id=bia["id"])
    evento("diligencia", "Diligência ao cartório", 2, "11:00:00", processo_id=p5["id"], responsavel_id=ester["id"])
    evento("compromisso", "Reunião interna de sócios", -2, "17:00:00", responsavel_id=bia["id"])
    ok(c.post("/api/eventos", json={"tipo": "vencimento_financeiro", "titulo": "Honorários — parcela 3/6 (Helena)", "inicio": iso(5), "dia_inteiro": True, "valor_centavos": 150000, "cliente_id": cli[0]["id"]}))
    ok(c.post("/api/publicacoes/importar", json=[
        {"fonte": "DJE", "data_disponibilizacao": iso(-1), "texto": f"Processo {p1['numero']}. Intime-se a parte autora para manifestar-se sobre o laudo pericial no prazo de 15 (quinze) dias."},
        {"fonte": "DJE", "data_disponibilizacao": iso(-1), "texto": f"Processo {p3['numero']}. Vistos. Cite-se a executada para, querendo, apresentar embargos à execução."},
        {"fonte": "DJE", "data_disponibilizacao": iso(0), "texto": f"Processo {cnj.gerar(9990001, 2022, 8, 26, 1)}. Intimação para recolher as custas em 5 dias."}]))
    return {"usuarios": 4, "clientes": len(cli), "processos": 5, "prazo_calculado": calc["data_fatal"]}


def main() -> int:
    from fastapi.testclient import TestClient

    from .app import create_app

    email, senha = os.environ.get("LEGAL_ADMIN_EMAIL"), os.environ.get("LEGAL_ADMIN_SENHA")
    if not (email and senha):
        print("Defina LEGAL_ADMIN_EMAIL e LEGAL_ADMIN_SENHA.", file=sys.stderr)
        return 2
    app = create_app()
    c = TestClient(app)
    token = c.post("/api/login", json={"email": email, "senha": senha}).json()["token"]
    c.headers["Authorization"] = f"Bearer {token}"
    if len(c.get("/api/usuarios").json()) > 1 or c.get("/api/clientes").json():
        print("O banco já tem dados; a demonstração só entra em banco vazio.", file=sys.stderr)
        return 1
    print(semear(c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
