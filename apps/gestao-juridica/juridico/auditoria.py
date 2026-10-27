"""Trilha de auditoria: quem fez o quê e quando, sem guardar conteúdo sensível."""
from __future__ import annotations

import sqlite3

from . import relogio


def registrar(con: sqlite3.Connection, usuario_id: int | None, entidade: str, entidade_id: int | None,
              acao: str, detalhes: str | None = None) -> None:
    con.execute("INSERT INTO auditoria(em,usuario_id,entidade,entidade_id,acao,detalhes) VALUES(?,?,?,?,?,?)",
                (relogio.agora_iso(), usuario_id, entidade, entidade_id, acao, detalhes))
