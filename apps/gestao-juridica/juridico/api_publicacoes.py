"""Publicações e intimações: importação, vínculo ao processo, sugestão de prazo e confirmação humana."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import acesso, auditoria, cnj, prazos_servico as ps, relogio
from .api_processos import inserir_movimentacao
from .deps import EDITORES, exigir_papel, get_db
from .regras_prazo import normalizar, sugerir

router = APIRouter(prefix="/api")


class PublicacaoIn(BaseModel):
    fonte: str = Field(default="manual", description="DJE, DJEN, PJe, DOU, e-mail, manual…")
    data_disponibilizacao: date
    texto: str = Field(min_length=10)


def _hash(fonte: str, data: str, texto: str) -> str:
    return hashlib.sha256(f"{fonte}|{data}|{normalizar(texto)}".encode()).hexdigest()


def _sugestoes(con: sqlite3.Connection, texto: str, processo_id: int | None) -> list[dict]:
    contexto = ""
    if processo_id and (p := con.execute("SELECT classe, assunto FROM processos WHERE id=?", (processo_id,)).fetchone()):
        contexto = f"{p['classe'] or ''} {p['assunto'] or ''}"
    return [s.__dict__ for s in sugerir(texto, contexto)]


def importar(con: sqlite3.Connection, itens: list[PublicacaoIn], usuario_id: int | None = None) -> dict:
    """Idempotente: a mesma publicação (fonte, data e texto) entra uma vez só."""
    novas = vinculadas = repetidas = 0
    for it in itens:
        h = _hash(it.fonte, it.data_disponibilizacao.isoformat(), it.texto)
        if con.execute("SELECT 1 FROM publicacoes WHERE hash=?", (h,)).fetchone():
            repetidas += 1
            continue
        numeros = cnj.achar_numeros(it.texto)
        proc = None
        for n in numeros:
            proc = con.execute("SELECT id FROM processos WHERE numero_digitos=?", (n.digitos,)).fetchone()
            if proc:
                break
        sug = _sugestoes(con, it.texto, proc["id"] if proc else None)
        cur = con.execute("""INSERT INTO publicacoes(fonte,data_disponibilizacao,texto,hash,processo_id,numero_encontrado,status,sugestao_json,criado_em)
                             VALUES(?,?,?,?,?,?,?,?,?)""",
                          (it.fonte, it.data_disponibilizacao.isoformat(), it.texto.strip(), h, proc["id"] if proc else None,
                           numeros[0].formatado if numeros else None, "vinculada" if proc else "nova", json.dumps(sug, ensure_ascii=False), relogio.agora_iso()))
        novas += 1
        if proc:
            vinculadas += 1
            inserir_movimentacao(con, proc["id"], it.data_disponibilizacao.isoformat(), "publicacao", f"[{it.fonte}] {it.texto.strip()[:400]}", "publicacao")
        auditoria.registrar(con, usuario_id, "publicacao", cur.lastrowid, "importada", it.fonte)
    return {"novas": novas, "vinculadas": vinculadas, "repetidas": repetidas}


def _dict(p: sqlite3.Row) -> dict:
    return {k: p[k] for k in p.keys() if k != "sugestao_json"} | {"sugestoes": json.loads(p["sugestao_json"])}


@router.post("/publicacoes/importar")
def importar_publicacoes(itens: list[PublicacaoIn], u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    return importar(con, itens, u["id"])


@router.get("/publicacoes")
def listar(status: str = "", processo_id: int = 0, limite: int = 200, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)),
           con: sqlite3.Connection = Depends(get_db)):
    cond, args = ["(p.processo_id IS NULL OR " + acesso.visivel("pr") + ")"], {"papel": u["papel"], "uid": u["id"], "lim": min(limite, 500)}
    if status:
        cond.append("p.status=:status")
        args["status"] = status
    if processo_id:
        cond.append("p.processo_id=:proc")
        args["proc"] = processo_id
    linhas = con.execute(f"""SELECT p.*, pr.numero AS processo_numero FROM publicacoes p LEFT JOIN processos pr ON pr.id=p.processo_id
                             WHERE {' AND '.join(cond)} ORDER BY p.data_disponibilizacao DESC, p.id DESC LIMIT :lim""", args).fetchall()
    return [_dict(p) for p in linhas]


def _carregar(con: sqlite3.Connection, u: sqlite3.Row, pub_id: int) -> sqlite3.Row:
    p = con.execute("SELECT * FROM publicacoes WHERE id=?", (pub_id,)).fetchone()
    if not p or (p["processo_id"] and not acesso.pode_ver(con, u, p["processo_id"])):
        raise HTTPException(404, "Publicação não encontrada.")
    return p


class VincularIn(BaseModel):
    processo_id: int


@router.post("/publicacoes/{pub_id}/vincular")
def vincular(pub_id: int, d: VincularIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    p = _carregar(con, u, pub_id)
    acesso.carregar_processo(con, u, d.processo_id)
    # Reavalia a sugestão com a classe/assunto do processo escolhido (o rito muda o prazo).
    con.execute("UPDATE publicacoes SET processo_id=?, sugestao_json=?, status=CASE WHEN status='nova' THEN 'vinculada' ELSE status END WHERE id=?",
                (d.processo_id, json.dumps(_sugestoes(con, p["texto"], d.processo_id), ensure_ascii=False), pub_id))
    inserir_movimentacao(con, d.processo_id, p["data_disponibilizacao"], "publicacao", f"[{p['fonte']}] {p['texto'][:400]}", "publicacao")
    auditoria.registrar(con, u["id"], "publicacao", pub_id, "vinculada", str(d.processo_id))
    return _dict(con.execute("SELECT * FROM publicacoes WHERE id=?", (pub_id,)).fetchone())


class CriarPrazoIn(BaseModel):
    sugestao: int = Field(default=0, ge=0, description="índice da sugestão a confirmar")
    descricao: str | None = None
    dias: int | None = Field(default=None, ge=1, le=365)
    contagem: Literal["uteis", "corridos"] | None = None
    dobro: bool = False
    responsavel_id: int | None = None
    revisor_id: int | None = None


@router.post("/publicacoes/{pub_id}/criar-prazo", status_code=201)
def criar_prazo(pub_id: int, d: CriarPrazoIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    """O humano confirma a sugestão (e pode corrigir dias/contagem); só então o prazo nasce."""
    p = _carregar(con, u, pub_id)
    if not p["processo_id"]:
        raise HTTPException(422, "Vincule a publicação a um processo antes de criar o prazo.")
    sugestoes = json.loads(p["sugestao_json"])
    if not sugestoes and not (d.dias and d.descricao):
        raise HTTPException(422, "Sem sugestão automática: informe descricao e dias.")
    s = sugestoes[d.sugestao] if sugestoes and d.sugestao < len(sugestoes) else {}
    proc = con.execute("SELECT * FROM processos WHERE id=?", (p["processo_id"],)).fetchone()
    fonte_dje = p["fonte"].upper().startswith("DJ")
    pid = ps.criar(con, u, proc, descricao=d.descricao or s.get("nome", "Prazo da publicação"), categoria=s.get("chave"),
                   evento="disponibilizacao_dje" if fonte_dje else "ciencia", data_evento=date.fromisoformat(p["data_disponibilizacao"]),
                   dias=d.dias or s.get("dias"), contagem=d.contagem or s.get("contagem", "uteis"), dobro=d.dobro, suspender_recesso=True,
                   data_fatal=None, responsavel_id=d.responsavel_id or u["id"], revisor_id=d.revisor_id, base_legal=s.get("base_legal"),
                   publicacao_id=pub_id)
    con.execute("UPDATE publicacoes SET status='tratada' WHERE id=?", (pub_id,))
    auditoria.registrar(con, u["id"], "publicacao", pub_id, "prazo_criado", str(pid))
    return {"prazo_id": pid}


@router.post("/publicacoes/{pub_id}/descartar")
def descartar(pub_id: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    _carregar(con, u, pub_id)
    con.execute("UPDATE publicacoes SET status='descartada' WHERE id=?", (pub_id,))
    auditoria.registrar(con, u["id"], "publicacao", pub_id, "descartada")
    return {"ok": True}
