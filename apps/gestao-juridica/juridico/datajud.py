"""Andamentos pela API Pública do DataJud (CNJ).

Precisa de chave (variável DATAJUD_API_KEY; o CNJ publica a chave pública na wiki do
DataJud). O transporte é injetável: o teste usa resposta gravada, nunca a rede.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import datetime

from . import cnj
from .relogio import BRT

BASE = "https://api-publica.datajud.cnj.jus.br"


class DataJudErro(RuntimeError):
    pass


def alias(n: cnj.NumeroCNJ) -> str | None:
    """Sufixo do índice (`api_publica_<alias>`) para o tribunal do número."""
    tr = int(n.tr) if n.tr.isdigit() else 0
    return {
        "3": "stj", "7": "stm",
        "4": f"trf{tr}", "5": "tst" if tr == 0 else f"trt{tr}",
        "8": f"tj{n.uf.lower()}" if n.uf else None,
        "6": f"tre-{n.uf.lower()}" if n.uf else "tse",
        "9": f"tjm{n.uf.lower()}" if n.uf else None,
    }.get(n.ramo)


Transporte = Callable[[str, dict, dict], dict]


def _transporte_http(url: str, cabecalhos: dict, corpo: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), headers=cabecalhos, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=25) as r:  # noqa: S310 (URL fixa, https)
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise DataJudErro(f"DataJud respondeu HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise DataJudErro(f"DataJud inacessível: {e}") from e


def consultar(numero: str, chave: str | None = None, transporte: Transporte | None = None) -> dict:
    n = cnj.interpretar(numero)
    if not n:
        raise DataJudErro("Número CNJ inválido.")
    sufixo = alias(n)
    if not sufixo:
        raise DataJudErro(f"O DataJud não tem índice público para {n.sigla}.")
    chave = chave or os.environ.get("DATAJUD_API_KEY")
    if not chave and transporte is None:
        raise DataJudErro("Defina DATAJUD_API_KEY para consultar o DataJud.")
    cab = {"Authorization": f"APIKey {chave or ''}", "Content-Type": "application/json"}
    corpo = {"query": {"match": {"numeroProcesso": n.digitos}}}
    return (transporte or _transporte_http)(f"{BASE}/api_publica_{sufixo}/_search", cab, corpo)


def extrair_movimentos(resposta: dict) -> list[dict]:
    """Movimentos do primeiro hit como [{data, tipo, descricao}], do mais novo ao mais antigo."""
    hits = (resposta.get("hits") or {}).get("hits") or []
    if not hits:
        return []
    saida = []
    for m in (hits[0].get("_source") or {}).get("movimentos") or []:
        bruto = m.get("dataHora") or ""
        try:
            instante = datetime.fromisoformat(bruto.replace("Z", "+00:00")).astimezone(BRT)
        except ValueError:
            continue
        data = instante.date().isoformat()
        complementos = "; ".join(filter(None, (c.get("descricao") or c.get("nome") for c in m.get("complementosTabelados") or [])))
        nome = m.get("nome") or "Movimento"
        saida.append((instante, {"data": data, "tipo": str(m.get("codigo") or ""), "descricao": f"{nome} — {complementos}" if complementos else nome}))
    # Mesmo dia, horas diferentes: a ordem é pelo instante, não só pela data.
    return [m for _, m in sorted(saida, key=lambda x: x[0], reverse=True)]
