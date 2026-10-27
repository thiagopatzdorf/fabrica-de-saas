"""Controle de acesso por processo.

Processo `restrito` só aparece para administrador e responsáveis. Para quem não tem
acesso a resposta é 404 (não 403), para não revelar que o processo existe.
"""
from __future__ import annotations

import sqlite3

from fastapi import HTTPException

def visivel(alias: str = "p") -> str:
    """Fragmento SQL das listagens (usa os parâmetros :papel e :uid); `alias` é o apelido de processos."""
    return (f"(:papel='admin' OR {alias}.restrito=0 OR EXISTS("
            f"SELECT 1 FROM processo_responsaveis r WHERE r.processo_id={alias}.id AND r.usuario_id=:uid))")


def pode_ver(con: sqlite3.Connection, u: sqlite3.Row, processo_id: int) -> bool:
    p = con.execute("SELECT restrito FROM processos WHERE id=?", (processo_id,)).fetchone()
    if not p:
        return False
    if u["papel"] == "admin" or not p["restrito"]:
        return True
    return bool(con.execute("SELECT 1 FROM processo_responsaveis WHERE processo_id=? AND usuario_id=?",
                            (processo_id, u["id"])).fetchone())


def carregar_processo(con: sqlite3.Connection, u: sqlite3.Row, processo_id: int) -> sqlite3.Row:
    if not pode_ver(con, u, processo_id):
        raise HTTPException(404, "Processo não encontrado.")
    return con.execute("SELECT * FROM processos WHERE id=?", (processo_id,)).fetchone()
