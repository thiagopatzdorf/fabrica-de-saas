"""Dependências comuns das rotas: conexão por requisição, usuário logado e papéis."""
from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request

from . import db, seguranca


def get_db(request: Request) -> Iterator[sqlite3.Connection]:
    con = db.conectar(request.app.state.caminho_banco)
    try:
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


def _token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get("sessao")


def usuario_atual(request: Request, con: sqlite3.Connection = Depends(get_db)) -> sqlite3.Row:
    dados = seguranca.ler_sessao(_token(request))
    if not dados:
        raise HTTPException(401, "Sessão ausente ou expirada. Entre novamente.")
    u = con.execute("SELECT * FROM usuarios WHERE id=? AND ativo=1", (dados["u"],)).fetchone()
    if not u or seguranca.impressao_senha(u["senha_hash"]) != dados.get("v"):
        raise HTTPException(401, "Sessão inválida. Entre novamente.")
    return u


def exigir_papel(*papeis: str):
    def dep(u: sqlite3.Row = Depends(usuario_atual)) -> sqlite3.Row:
        if u["papel"] not in papeis:
            raise HTTPException(403, "Seu perfil não tem permissão para esta ação.")
        return u
    return dep


EDITORES = ("admin", "advogado", "estagiario")  # quem mexe em processos, prazos, documentos
