"""Identificação de prazos a partir do texto de uma publicação/intimação.

Determinístico e conferível: cada regra cita a base legal e tem teste. O resultado é uma
SUGESTÃO que um humano confirma; o sistema nunca cria prazo sozinho a partir de texto.

Quando o texto traz o prazo expresso ("no prazo de 5 dias"), vale o prazo do juízo, não o
padrão da lei. Sem regra reconhecida e sem prazo expresso, não sugere nada.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFD", texto or "")
    sem_acento = "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sem_acento.lower()).strip()


@dataclass(frozen=True)
class Regra:
    chave: str
    nome: str
    dias: int
    contagem: str
    base_legal: str
    padroes: tuple[str, ...]
    so_se: str | None = None  # só vale se este trecho aparece no texto ou no contexto do processo (classe/assunto)
    exceto_se: str | None = None  # não vale se aparecer


REGRAS: tuple[Regra, ...] = (
    Regra("contestacao", "Contestação", 15, "uteis", "CPC art. 335",
          (r"\bcontest(ar|acao|e)\b", r"apresentar (sua )?defesa", r"citad[oa].{0,60}(contest|defesa)")),
    Regra("replica", "Réplica", 15, "uteis", "CPC arts. 350 e 351", (r"\breplica\b", r"manifestar-se sobre a contestacao")),
    Regra("apelacao", "Apelação", 15, "uteis", "CPC arts. 1.003 §5º e 1.009", (r"\bapelacao\b", r"\bapelar\b")),
    Regra("contrarrazoes", "Contrarrazões", 15, "uteis", "CPC art. 1.010 §1º", (r"contrarrazoes", r"contra-razoes")),
    Regra("agravo_instrumento", "Agravo de instrumento", 15, "uteis", "CPC arts. 1.003 §5º e 1.015", (r"agravo de instrumento",)),
    Regra("agravo_interno", "Agravo interno", 15, "uteis", "CPC art. 1.021 §2º", (r"agravo interno", r"agravo regimental")),
    Regra("embargos_declaracao", "Embargos de declaração", 5, "uteis", "CPC art. 1.023", (r"embargos de declaracao",)),
    Regra("recurso_especial", "Recurso especial / extraordinário", 15, "uteis", "CPC arts. 1.003 §5º e 1.029",
          (r"recurso especial", r"recurso extraordinario")),
    Regra("manifestacao_laudo", "Manifestação sobre laudo pericial", 15, "uteis", "CPC art. 477 §1º",
          (r"laudo pericial", r"manifestar-se sobre o laudo")),
    Regra("cumprimento_pagamento", "Pagamento voluntário (cumprimento de sentença)", 15, "uteis", "CPC art. 523",
          (r"cumprimento de sentenca.{0,80}(pagar|pagamento)", r"pagar o debito")),
    Regra("impugnacao_cumprimento", "Impugnação ao cumprimento de sentença", 15, "uteis", "CPC art. 525",
          (r"impugnacao ao cumprimento", r"impugnar o cumprimento")),
    Regra("embargos_execucao", "Embargos à execução", 15, "uteis", "CPC art. 915", (r"embargos a execucao",), exceto_se="fiscal"),
    Regra("embargos_execucao_fiscal", "Embargos à execução fiscal", 30, "uteis", "Lei 6.830/1980 (LEF) art. 16", (r"embargos a execucao",), so_se="fiscal"),
    Regra("emenda_inicial", "Emenda da petição inicial", 15, "uteis", "CPC art. 321", (r"emendar a (peticao )?inicial", r"emenda da inicial")),
    Regra("recurso_ordinario_trabalhista", "Recurso ordinário trabalhista", 8, "uteis", "CLT arts. 775 e 895",
          (r"recurso ordinario",)),
    Regra("recurso_inominado", "Recurso inominado (Juizados)", 10, "uteis", "Lei 9.099/1995 art. 42 e art. 12-A",
          (r"recurso inominado",)),
)

_PALAVRAS = {"um": 1, "dois": 2, "tres": 3, "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9,
             "dez": 10, "quinze": 15, "vinte": 20, "trinta": 30, "quarenta e cinco": 45, "sessenta": 60}
_NUM = r"(\d{1,3}|" + "|".join(sorted(map(re.escape, _PALAVRAS), key=len, reverse=True)) + r")"
_EXPRESSO = re.compile(rf"prazo (?:legal )?de {_NUM}\s*(?:\([^)]*\)\s*)?dias?(?:\s+(uteis|corridos))?"
                       rf"|\bem {_NUM}\s*(?:\([^)]*\)\s*)?dias?(?:\s+(uteis|corridos))?"
                       rf"|\bno prazo de {_NUM}\s*(?:\([^)]*\)\s*)?dias?(?:\s+(uteis|corridos))?")


@dataclass
class Sugestao:
    chave: str
    nome: str
    dias: int
    contagem: str
    base_legal: str
    origem: str  # "texto" (prazo expresso no texto) ou "regra" (padrão legal)


def _numero(token: str) -> int:
    return int(token) if token.isdigit() else _PALAVRAS[token]


def prazo_expresso(texto_norm: str) -> tuple[int, str | None] | None:
    m = _EXPRESSO.search(texto_norm)
    if not m:
        return None
    grupos = [g for g in m.groups() if g]
    dias = _numero(grupos[0])
    contagem = grupos[1] if len(grupos) > 1 else None
    return dias, contagem


def sugerir(texto: str, contexto: str = "") -> list[Sugestao]:
    """`contexto` é o que se sabe do processo (classe, assunto): o mesmo texto muda de prazo conforme o rito."""
    t = normalizar(texto)
    ctx = f"{t} {normalizar(contexto)}"
    expresso = prazo_expresso(t)
    achadas = [r for r in REGRAS if any(re.search(p, t) for p in r.padroes)
               and (not r.so_se or r.so_se in ctx) and (not r.exceto_se or r.exceto_se not in ctx)]
    saida: list[Sugestao] = []
    for r in achadas:
        if expresso:
            dias, cont = expresso
            saida.append(Sugestao(r.chave, r.nome, dias, cont or r.contagem, r.base_legal + " (prazo fixado no texto)", "texto"))
        else:
            saida.append(Sugestao(r.chave, r.nome, r.dias, r.contagem, r.base_legal, "regra"))
    if expresso and not achadas:
        dias, cont = expresso
        saida.append(Sugestao("prazo_judicial", "Prazo fixado pelo juízo", dias, cont or "uteis",
                              "CPC art. 218 §1º e art. 219 (prazo do juiz)", "texto"))
    return saida
