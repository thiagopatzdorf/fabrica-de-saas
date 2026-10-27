"""Fábrica do aplicativo FastAPI."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import api_agenda, api_basico, api_documentos, api_painel, api_prazos, api_processos, api_publicacoes
from . import config, db, modelos, relogio, seguranca

ESTATICOS = Path(__file__).resolve().parents[1] / "static"

# CSP sem 'unsafe-inline' em script: o front é arquivo estático; qualquer HTML injetado não executa.
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")


def preparar_banco(caminho: Path | str) -> None:
    con = db.conectar(caminho)
    try:
        db.migrar(con)
        semear_modelos(con)
        criar_admin_inicial(con)
        con.commit()
    finally:
        con.close()


def semear_modelos(con: sqlite3.Connection) -> None:
    agora = relogio.agora_iso()
    for nome, categoria, corpo in modelos.MODELOS_INICIAIS:
        con.execute("INSERT OR IGNORE INTO modelos(nome,categoria,corpo,criado_em,atualizado_em) VALUES(?,?,?,?,?)", (nome, categoria, corpo, agora, agora))


def criar_admin_inicial(con: sqlite3.Connection) -> None:
    """Primeiro acesso: cria o administrador a partir do ambiente, só se não há nenhum usuário."""
    email, senha = os.environ.get("LEGAL_ADMIN_EMAIL"), os.environ.get("LEGAL_ADMIN_SENHA")
    if email and senha and not con.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
        con.execute("INSERT INTO usuarios(nome,email,senha_hash,papel,criado_em) VALUES(?,?,?,?,?)",
                    (os.environ.get("LEGAL_ADMIN_NOME", "Administrador"), email, seguranca.hash_senha(senha), "admin", relogio.agora_iso()))


def create_app(caminho_banco: Path | str | None = None) -> FastAPI:
    app = FastAPI(title="Gestão Jurídica", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.state.caminho_banco = str(caminho_banco or config.caminho_banco())
    preparar_banco(app.state.caminho_banco)

    @app.middleware("http")
    async def cabecalhos(request: Request, call_next):
        resp = await call_next(request)
        if not request.url.path.startswith("/api/docs"):  # o Swagger UI precisa de script inline
            resp.headers["Content-Security-Policy"] = CSP
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "same-origin"
        resp.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    for r in (api_basico, api_processos, api_prazos, api_agenda, api_publicacoes, api_documentos, api_painel):
        app.include_router(r.router)

    @app.get("/api/saude")
    def saude():
        return {"ok": True}

    @app.exception_handler(ValueError)
    async def valor_invalido(_r: Request, e: ValueError):
        return JSONResponse({"detail": str(e)}, status_code=422)

    @app.get("/assinar.html", include_in_schema=False)
    def pagina_assinar():
        return FileResponse(ESTATICOS / "assinar.html")

    app.mount("/", StaticFiles(directory=ESTATICOS, html=True), name="front")
    return app


app = None  # `uvicorn juridico.app:criar` (fábrica): evita criar banco ao importar o módulo.


def criar() -> FastAPI:
    return create_app()
