"""Modelos de documento com variáveis `{{ cliente.nome }}` e geração de .docx.

Variável desconhecida ou sem valor NÃO vira texto em branco: a geração falha listando o que
falta. Petição com "{{...}}" ou lacuna silenciosa é pior do que petição que não sai.
"""
from __future__ import annotations

import io
import os
import re
import sqlite3
import zipfile
from xml.sax.saxutils import escape

from . import relogio

_VAR = re.compile(r"\{\{\s*([a-z_]+\.[a-z_]+|[a-z_]+)\s*\}\}")
_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

VARIAVEIS = {
    "cliente.nome": "Nome do cliente", "cliente.documento": "CPF/CNPJ do cliente", "cliente.endereco": "Endereço do cliente",
    "cliente.email": "E-mail do cliente", "cliente.telefone": "Telefone do cliente",
    "processo.numero": "Número do processo", "processo.tribunal": "Tribunal", "processo.vara": "Vara/órgão", "processo.comarca": "Comarca",
    "processo.classe": "Classe", "processo.assunto": "Assunto", "processo.valor_causa": "Valor da causa (R$)",
    "autor.nome": "Autor (1ª parte do polo ativo)", "reu.nome": "Réu (1ª parte do polo passivo)",
    "advogado.nome": "Advogado responsável", "advogado.oab": "OAB do advogado responsável",
    "escritorio.nome": "Nome do escritório (LEGAL_ESCRITORIO)", "escritorio.cidade": "Cidade do escritório (LEGAL_CIDADE)",
    "data.hoje": "Data de hoje (dd/mm/aaaa)", "data.extenso": "Data por extenso",
}


class VariaveisFaltando(Exception):
    def __init__(self, faltando: list[str]):
        self.faltando = faltando
        super().__init__("Faltam dados para: " + ", ".join(faltando))


def _brl(centavos: int | None) -> str:
    if centavos is None:
        return ""
    reais = f"{centavos // 100:,}".replace(",", ".")
    return f"{reais},{centavos % 100:02d}"


def contexto(con: sqlite3.Connection, usuario: sqlite3.Row, processo_id: int | None = None, cliente_id: int | None = None,
             extras: dict[str, str] | None = None) -> dict[str, str]:
    ctx: dict[str, str] = {}
    proc = con.execute("SELECT * FROM processos WHERE id=?", (processo_id,)).fetchone() if processo_id else None
    cid = proc["cliente_id"] if proc else cliente_id
    if cid and (c := con.execute("SELECT * FROM clientes WHERE id=?", (cid,)).fetchone()):
        ctx |= {"cliente.nome": c["nome"], "cliente.documento": c["documento"] or "", "cliente.endereco": c["endereco"] or "",
                "cliente.email": c["email"] or "", "cliente.telefone": c["telefone"] or ""}
    adv = usuario
    if proc:
        ctx |= {"processo.numero": proc["numero"] or "", "processo.tribunal": proc["tribunal"] or "", "processo.vara": proc["vara"] or "",
                "processo.comarca": proc["comarca"] or "", "processo.classe": proc["classe"] or "", "processo.assunto": proc["assunto"] or "",
                "processo.valor_causa": _brl(proc["valor_causa_centavos"])}
        for polo, chave in (("ativo", "autor.nome"), ("passivo", "reu.nome")):
            p = con.execute("SELECT nome FROM partes WHERE processo_id=? AND polo=? AND papel='parte' ORDER BY id LIMIT 1", (proc["id"], polo)).fetchone()
            ctx[chave] = p["nome"] if p else ""
        r = con.execute("""SELECT u.* FROM processo_responsaveis pr JOIN usuarios u ON u.id=pr.usuario_id
                           WHERE pr.processo_id=? AND pr.papel='responsavel' LIMIT 1""", (proc["id"],)).fetchone()
        adv = r or usuario
    ctx |= {"advogado.nome": adv["nome"], "advogado.oab": adv["oab"] or "",
            "escritorio.nome": os.environ.get("LEGAL_ESCRITORIO", ""), "escritorio.cidade": os.environ.get("LEGAL_CIDADE", "") or (proc["comarca"] if proc and proc["comarca"] else "")}
    h = relogio.hoje()
    ctx |= {"data.hoje": h.strftime("%d/%m/%Y"), "data.extenso": f"{h.day} de {_MESES[h.month - 1]} de {h.year}"}
    ctx |= {k: v for k, v in (extras or {}).items()}
    return ctx


def variaveis_do_modelo(corpo: str) -> list[str]:
    return list(dict.fromkeys(_VAR.findall(corpo)))


def renderizar(corpo: str, ctx: dict[str, str]) -> str:
    faltando = [v for v in variaveis_do_modelo(corpo) if not (ctx.get(v) or "").strip()]
    if faltando:
        raise VariaveisFaltando(faltando)
    return _VAR.sub(lambda m: ctx[m.group(1)], corpo)


def gerar_docx(texto: str) -> bytes:
    """.docx mínimo e válido: linhas `# ` viram título centralizado em negrito; o resto, parágrafos."""
    paragrafos = []
    for linha in texto.split("\n"):
        if linha.startswith("# "):
            run = f'<w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">{escape(linha[2:])}</w:t></w:r>'
            paragrafos.append(f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>{run}</w:p>')
        else:
            paragrafos.append(f'<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:after="120"/></w:pPr><w:r><w:t xml:space="preserve">{escape(linha)}</w:t></w:r></w:p>')
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           + "".join(paragrafos) +
           '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>'
           '</w:body></w:document>')
    tipos = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", tipos)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)
    return buf.getvalue()


MODELOS_INICIAIS = [
    ("Procuração ad judicia", "Procuração", """# PROCURAÇÃO AD JUDICIA
OUTORGANTE: {{ cliente.nome }}, inscrito(a) no CPF/CNPJ sob o nº {{ cliente.documento }}, residente e domiciliado(a) em {{ cliente.endereco }}.
OUTORGADO(A): {{ advogado.nome }}, advogado(a), inscrito(a) na OAB sob o nº {{ advogado.oab }}.
PODERES: pelo presente instrumento, o(a) outorgante nomeia o(a) outorgado(a) seu procurador, conferindo-lhe os poderes da cláusula ad judicia et extra, para o foro em geral, podendo propor ações, contestar, recorrer, transigir, desistir, receber e dar quitação, firmar compromissos e substabelecer, com ou sem reservas, para a defesa dos interesses do outorgante.
{{ escritorio.cidade }}, {{ data.extenso }}.
______________________________
{{ cliente.nome }}"""),
    ("Contrato de honorários advocatícios", "Contrato", """# CONTRATO DE HONORÁRIOS ADVOCATÍCIOS
CONTRATANTE: {{ cliente.nome }}, CPF/CNPJ {{ cliente.documento }}, {{ cliente.endereco }}.
CONTRATADO(A): {{ advogado.nome }}, OAB {{ advogado.oab }}.
OBJETO: prestação de serviços advocatícios relativos a {{ processo.assunto }}, processo nº {{ processo.numero }}, perante {{ processo.vara }}, {{ processo.comarca }}.
HONORÁRIOS: as partes ajustam os honorários na forma que consta em anexo a este instrumento, sem prejuízo dos honorários de sucumbência, que pertencem ao advogado (Lei 8.906/1994, art. 23).
{{ escritorio.cidade }}, {{ data.extenso }}.
______________________________                ______________________________
{{ cliente.nome }}                                    {{ advogado.nome }}"""),
    ("Notificação extrajudicial", "Notificação", """# NOTIFICAÇÃO EXTRAJUDICIAL
NOTIFICANTE: {{ cliente.nome }}, CPF/CNPJ {{ cliente.documento }}, por seu(sua) advogado(a) {{ advogado.nome }}, OAB {{ advogado.oab }}.
NOTIFICADO(A): {{ reu.nome }}.
Pela presente, fica o(a) notificado(a) cientificado(a) de que {{ processo.assunto }}, devendo, no prazo de 10 (dez) dias contados do recebimento, regularizar a situação descrita, sob pena de adoção das medidas judiciais cabíveis.
{{ escritorio.cidade }}, {{ data.extenso }}.
{{ advogado.nome }} — OAB {{ advogado.oab }}"""),
]
