"""Leitor mínimo do arquivo `_headers` (formato de hospedagem estática: Cloudflare Pages/Workers, Netlify).

Existe só para os testes conferirem, sem rede e sem dependência, que cabeçalho de segurança (CSP com
`connect-src 'none'`, cache) chega em cada caminho do app. Regras do formato aqui implementadas:
linha sem recuo é um padrão; linhas recuadas são `Nome: valor` (soma) ou `! Nome` (remove o que uma regra
mais larga pôs); `*` casa qualquer sufixo (splat); `:nome` casa um segmento; todas as regras que casam valem,
e o mesmo cabeçalho posto duas vezes vira um valor só, separado por vírgula.
"""
from __future__ import annotations

import re

ARQUIVOS_DE_CONFIG = {"/_headers", "/_redirects"}
LIMITE_REGRAS_HEADERS = 100
LIMITE_LINHA_HEADERS = 2000


def ler_headers(texto: str) -> list[tuple[str, list[str], list[tuple[str, str]]]]:
    """[(padrão, [cabeçalhos a tirar], [(nome, valor)])], com os limites da doc conferidos."""
    regras: list[tuple[str, list[str], list[tuple[str, str]]]] = []
    for n, bruta in enumerate(texto.splitlines(), 1):
        if len(bruta) > LIMITE_LINHA_HEADERS:
            raise ValueError(f"_headers linha {n} passa de {LIMITE_LINHA_HEADERS} caracteres")
        linha = bruta.rstrip()
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        if linha[0] not in " \t":
            regras.append((linha.strip(), [], []))
            continue
        if not regras:
            raise ValueError(f"_headers linha {n}: cabeçalho antes de qualquer padrão")
        item = linha.strip()
        if item.startswith("!"):
            regras[-1][1].append(item[1:].strip())
        elif ":" in item:
            nome, valor = item.split(":", 1)
            regras[-1][2].append((nome.strip(), valor.strip()))
        else:
            raise ValueError(f"_headers linha {n}: esperado 'Nome: valor' ou '! Nome'")
    return regras


def _padrao_casa(padrao: str, caminho: str) -> dict[str, str] | None:
    partes: list[str] = []
    i = 0
    while i < len(padrao):
        c = padrao[i]
        if c == "*":
            partes.append("(?P<splat>.*)")
        elif c == ":" and i + 1 < len(padrao) and padrao[i + 1].isalpha():
            j = i + 1
            while j < len(padrao) and (padrao[j].isalnum() or padrao[j] == "_"):
                j += 1
            partes.append(f"(?P<{padrao[i + 1:j]}>[^/]+)")
            i = j
            continue
        else:
            partes.append(re.escape(c))
        i += 1
    m = re.fullmatch("".join(partes), caminho)
    return m.groupdict() if m else None


def cabecalhos_para(texto_headers: str, caminho: str, base: dict[str, str] | None = None) -> dict[str, str]:
    """Os cabeçalhos que a hospedagem poria na resposta de `caminho`, partindo de `base`. Nomes em minúsculas."""
    out = {k.lower(): v for k, v in (base or {}).items()}
    for padrao, tirar, por in ler_headers(texto_headers):
        grupos = _padrao_casa(padrao, caminho)
        if grupos is None:
            continue
        for nome in tirar:
            out.pop(nome.lower(), None)
        for nome, valor in por:
            for g, v in grupos.items():
                valor = valor.replace(f":{g}", v)
            k = nome.lower()
            out[k] = f"{out[k]}, {valor}" if k in out else valor
    return out
