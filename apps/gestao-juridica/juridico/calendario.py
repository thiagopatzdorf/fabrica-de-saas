"""Contagem de prazos processuais.

Regras (CPC): o dia do começo não conta (art. 224); prazo em dias úteis só conta dia útil
(art. 219); o recesso de 20/12 a 20/01 suspende o prazo (art. 220); se a publicação é por
DJe, ela vale no primeiro dia útil seguinte à disponibilização e a contagem começa no
útil seguinte a ela (Lei 11.419/2006 art. 4º §3º e CPC art. 224 §3º); prazo que termina em
dia sem expediente vai para o primeiro dia útil seguinte (art. 224 §1º); Fazenda, MP e
Defensoria contam em dobro (arts. 180, 183 e 186).

O calendário base só tem feriados NACIONAIS. Feriado estadual, municipal e suspensão
local de expediente entram em `extras` (tabela `feriados`): sem eles a data pode sair um
dia adiantada. A data calculada é apoio; o advogado confere antes de confiar.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta


def pascoa(ano: int) -> date:
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    ele = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ele) // 451
    mes = (h + ele - 7 * m + 114) // 31
    dia = (h + ele - 7 * m + 114) % 31 + 1
    return date(ano, mes, dia)


def feriados_nacionais(ano: int) -> dict[date, str]:
    f = {
        date(ano, 1, 1): "Confraternização Universal",
        date(ano, 4, 21): "Tiradentes",
        date(ano, 5, 1): "Dia do Trabalho",
        date(ano, 9, 7): "Independência do Brasil",
        date(ano, 10, 12): "Nossa Senhora Aparecida",
        date(ano, 11, 2): "Finados",
        date(ano, 11, 15): "Proclamação da República",
        date(ano, 12, 25): "Natal",
        pascoa(ano) - timedelta(days=2): "Sexta-feira Santa",
    }
    if ano >= 2024:  # Lei 14.759/2023
        f[date(ano, 11, 20)] = "Dia Nacional de Zumbi e da Consciência Negra"
    return f


def em_recesso(d: date) -> bool:
    return (d.month == 12 and d.day >= 20) or (d.month == 1 and d.day <= 20)


def dia_util(d: date, extras: frozenset[date] | set[date] = frozenset()) -> bool:
    return d.weekday() < 5 and d not in feriados_nacionais(d.year) and d not in extras


def proximo_dia_util(d: date, extras=frozenset(), *, suspender_recesso: bool = False) -> date:
    """Primeiro dia >= d com expediente."""
    while not dia_util(d, extras) or (suspender_recesso and em_recesso(d)):
        d += timedelta(days=1)
    return d


def recuar_dias_uteis(d: date, n: int, extras=frozenset()) -> date:
    """n dias úteis antes de d (margem de segurança: o "fatal interno")."""
    while n > 0:
        d -= timedelta(days=1)
        if dia_util(d, extras):
            n -= 1
    return d


@dataclass
class ResultadoPrazo:
    data_fatal: date
    primeiro_dia: date
    dias_contados: int
    publicacao: date | None
    protraido: bool
    memoria: list[str] = field(default_factory=list)


def _fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def calcular_prazo(data_evento: date, dias: int, *, evento: str = "ciencia", contagem: str = "uteis",
                   dobro: bool = False, extras=frozenset(), suspender_recesso: bool = True) -> ResultadoPrazo:
    """Data fatal de um prazo.

    evento: "ciencia" (intimação pessoal/eletrônica: data da ciência) ou
            "disponibilizacao_dje" (data em que o DJe disponibilizou a publicação).
    contagem: "uteis" ou "corridos".
    """
    if dias < 1:
        raise ValueError("o prazo precisa ter ao menos 1 dia")
    if contagem not in {"uteis", "corridos"}:
        raise ValueError("contagem deve ser 'uteis' ou 'corridos'")
    if evento not in {"ciencia", "disponibilizacao_dje"}:
        raise ValueError("evento deve ser 'ciencia' ou 'disponibilizacao_dje'")
    extras = frozenset(extras)
    total = dias * 2 if dobro else dias
    memoria = [f"Evento: {'disponibilização no DJe' if evento == 'disponibilizacao_dje' else 'ciência/intimação'} em {_fmt(data_evento)}."]
    publicacao = None
    if evento == "disponibilizacao_dje":
        publicacao = proximo_dia_util(data_evento + timedelta(days=1), extras)
        memoria.append(f"Publicação: {_fmt(publicacao)} (primeiro dia útil após a disponibilização).")
        inicio = proximo_dia_util(publicacao + timedelta(days=1), extras)
        memoria.append(f"Início da contagem: {_fmt(inicio)} (primeiro dia útil após a publicação).")
    else:
        inicio = data_evento + timedelta(days=1)
        memoria.append("O dia da ciência não conta; a contagem começa no dia seguinte.")
    memoria.append(f"Prazo: {dias} dias {'úteis' if contagem == 'uteis' else 'corridos'}"
                   + (f", em dobro = {total}." if dobro else "."))
    if suspender_recesso:
        memoria.append("Recesso forense (20/12 a 20/01) suspende a contagem.")

    contados, cursor, primeiro = 0, inicio, None
    while True:
        conta = (dia_util(cursor, extras) if contagem == "uteis" else True) and not (suspender_recesso and em_recesso(cursor))
        if conta:
            contados += 1
            primeiro = primeiro or cursor
            if contados == total:
                break
        cursor += timedelta(days=1)
    fim, protraido = cursor, False
    while not dia_util(fim, extras) or (suspender_recesso and em_recesso(fim)):
        fim += timedelta(days=1)
        protraido = True
    if protraido:
        memoria.append(f"O dia {_fmt(cursor)} não tem expediente; vence no primeiro dia útil seguinte.")
    memoria.append(f"Primeiro dia contado: {_fmt(primeiro)}. Data fatal: {_fmt(fim)}.")
    return ResultadoPrazo(fim, primeiro, total, publicacao, protraido, memoria)
