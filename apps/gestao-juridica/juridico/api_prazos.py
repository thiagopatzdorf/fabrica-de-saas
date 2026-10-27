"""Prazos: cálculo, cadastro, responsável/revisor, status e histórico."""
from __future__ import annotations

import sqlite3
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from . import acesso, auditoria, prazos_servico as ps, relogio
from .calendario import calcular_prazo, recuar_dias_uteis
from .deps import EDITORES, exigir_papel, get_db, usuario_atual
from .regras_prazo import REGRAS

router = APIRouter(prefix="/api")

Evento = Literal["ciencia", "disponibilizacao_dje", "manual"]
Contagem = Literal["uteis", "corridos"]


class CalculoIn(BaseModel):
    data_evento: date
    dias: int = Field(ge=1, le=365)
    evento: Literal["ciencia", "disponibilizacao_dje"] = "disponibilizacao_dje"
    contagem: Contagem = "uteis"
    dobro: bool = False
    suspender_recesso: bool = True
    margem_dias: int = Field(default=2, ge=0, le=30)
    processo_id: int | None = None


@router.post("/prazos/calcular")
def calcular(d: CalculoIn, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    extras = frozenset()
    if d.processo_id:
        extras = ps.feriados_do_processo(con, acesso.carregar_processo(con, u, d.processo_id))
    r = calcular_prazo(d.data_evento, d.dias, evento=d.evento, contagem=d.contagem, dobro=d.dobro, extras=extras,
                       suspender_recesso=d.suspender_recesso)
    interna = recuar_dias_uteis(r.data_fatal, d.margem_dias, extras) if d.margem_dias else r.data_fatal
    return {"data_fatal": r.data_fatal, "data_interna": interna, "primeiro_dia": r.primeiro_dia, "publicacao": r.publicacao,
            "dias_contados": r.dias_contados, "protraido": r.protraido, "memoria": r.memoria}


@router.get("/prazos/modelos")
def modelos_de_prazo(_u: sqlite3.Row = Depends(usuario_atual)):
    """Catálogo de prazos legais conhecidos (para preencher dias, contagem e base legal)."""
    return [{"chave": r.chave, "nome": r.nome, "dias": r.dias, "contagem": r.contagem, "base_legal": r.base_legal} for r in REGRAS]


class PrazoIn(BaseModel):
    processo_id: int
    descricao: str = Field(min_length=3)
    categoria: str | None = None
    evento: Evento = "disponibilizacao_dje"
    data_evento: date | None = None
    dias: int | None = Field(default=None, ge=1, le=365)
    contagem: Contagem = "uteis"
    dobro: bool = False
    suspender_recesso: bool = True
    data_fatal: date | None = None
    responsavel_id: int | None = None
    revisor_id: int | None = None
    margem_dias: int = Field(default=2, ge=0, le=30)
    base_legal: str | None = None

    @model_validator(mode="after")
    def _coerente(self):
        if self.evento == "manual" and not self.data_fatal:
            raise ValueError("evento manual exige data_fatal")
        if self.evento != "manual" and not (self.data_evento and self.dias):
            raise ValueError("informe data_evento e dias, ou use evento manual com data_fatal")
        return self


def _linha(con: sqlite3.Connection, p: sqlite3.Row, hoje: date) -> dict:
    d = {k: p[k] for k in p.keys()}
    d["dobro"], d["suspender_recesso"] = bool(p["dobro"]), bool(p["suspender_recesso"])
    d["dias_restantes"] = ps.dias_ate(p["data_fatal"], hoje)
    return d


_SELECT = """SELECT pz.*, pr.numero AS processo_numero, pr.tribunal AS tribunal, c.nome AS cliente_nome, c.id AS cliente_id,
             ur.nome AS responsavel_nome, uv.nome AS revisor_nome
             FROM prazos pz JOIN processos pr ON pr.id=pz.processo_id JOIN clientes c ON c.id=pr.cliente_id
             LEFT JOIN usuarios ur ON ur.id=pz.responsavel_id LEFT JOIN usuarios uv ON uv.id=pz.revisor_id"""


@router.get("/prazos")
def listar(status: str = "", abertos: bool = False, responsavel_id: int = 0, revisor_id: int = 0, processo_id: int = 0,
           cliente_id: int = 0, de: date | None = None, ate: date | None = None, q: str = "", limite: int = 300,
           u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    ps.marcar_perdidos(con)
    cond, args = [acesso.visivel("pr")], {"papel": u["papel"], "uid": u["id"], "lim": min(limite, 1000)}
    if abertos:
        cond.append("pz.status IN('pendente','em_andamento','em_revisao')")
    if status:
        marcas = []
        for i, s in enumerate(status.split(",")):
            args[f"s{i}"] = s.strip()
            marcas.append(f":s{i}")
        cond.append(f"pz.status IN({','.join(marcas)})")
    for campo, valor, nome in (("pz.responsavel_id", responsavel_id, "resp"), ("pz.revisor_id", revisor_id, "rev"),
                               ("pz.processo_id", processo_id, "proc"), ("pr.cliente_id", cliente_id, "cli")):
        if valor:
            cond.append(f"{campo}=:{nome}")
            args[nome] = valor
    if de:
        cond.append("pz.data_fatal>=:de")
        args["de"] = de.isoformat()
    if ate:
        cond.append("pz.data_fatal<=:ate")
        args["ate"] = ate.isoformat()
    if q.strip():
        cond.append("(norm(pz.descricao) LIKE '%'||norm(:q)||'%' OR coalesce(pr.numero,'') LIKE '%'||:q||'%' OR norm(c.nome) LIKE '%'||norm(:q)||'%')")
        args["q"] = q.strip()
    linhas = con.execute(f"{_SELECT} WHERE {' AND '.join(cond)} ORDER BY pz.data_fatal, pz.id LIMIT :lim", args).fetchall()
    hoje = relogio.hoje()
    return [_linha(con, p, hoje) for p in linhas]


@router.post("/prazos", status_code=201)
def criar(d: PrazoIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    proc = acesso.carregar_processo(con, u, d.processo_id)
    responsavel = d.responsavel_id or (u["id"] if u["papel"] in ("admin", "advogado") else None)
    pid = ps.criar(con, u, proc, descricao=d.descricao, categoria=d.categoria, evento=d.evento, data_evento=d.data_evento, dias=d.dias,
                   contagem=d.contagem, dobro=d.dobro, suspender_recesso=d.suspender_recesso, data_fatal=d.data_fatal,
                   responsavel_id=responsavel, revisor_id=d.revisor_id, margem_dias=d.margem_dias, base_legal=d.base_legal)
    return ver(pid, u, con)


@router.get("/prazos/{pid}")
def ver(pid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    p = con.execute(f"{_SELECT} WHERE pz.id=?", (pid,)).fetchone()
    if not p or not acesso.pode_ver(con, u, p["processo_id"]):
        raise HTTPException(404, "Prazo não encontrado.")
    hist = con.execute("""SELECT h.acao,h.campo,h.de,h.para,h.em,coalesce(us.nome,'Sistema') AS usuario FROM prazo_historico h
                          LEFT JOIN usuarios us ON us.id=h.usuario_id WHERE h.prazo_id=? ORDER BY h.id""", (pid,)).fetchall()
    return _linha(con, p, relogio.hoje()) | {"historico": [dict(h) for h in hist]}


class PrazoPatch(BaseModel):
    descricao: str | None = Field(default=None, min_length=3)
    categoria: str | None = None
    responsavel_id: int | None = None
    revisor_id: int | None = None
    data_fatal: date | None = None
    motivo: str | None = Field(default=None, description="obrigatório ao mudar a data fatal")


@router.patch("/prazos/{pid}")
def alterar(pid: int, d: PrazoPatch, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    p = ver(pid, u, con)
    campos = d.model_dump(exclude_unset=True)
    motivo = campos.pop("motivo", None)
    if not campos:
        return p
    if p["status"] not in ps.ABERTOS:
        raise HTTPException(409, "Só prazo em aberto pode ser alterado.")
    if "data_fatal" in campos:
        if u["papel"] == "estagiario":
            raise HTTPException(403, "Estagiário não altera data fatal.")
        if not (motivo and len(motivo.strip()) >= 5):
            raise HTTPException(422, "Informe o motivo da mudança da data fatal (mín. 5 caracteres).")
        proc = con.execute("SELECT * FROM processos WHERE id=?", (p["processo_id"],)).fetchone()
        nova = campos["data_fatal"]
        campos["data_fatal"] = nova.isoformat()
        campos["data_interna"] = (recuar_dias_uteis(nova, p["margem_dias"], ps.feriados_do_processo(con, proc)) if p["margem_dias"] else nova).isoformat()
    novo_resp, novo_rev = campos.get("responsavel_id", p["responsavel_id"]), campos.get("revisor_id", p["revisor_id"])
    if novo_resp and novo_resp == novo_rev:
        raise HTTPException(422, "Revisor precisa ser diferente do responsável.")
    for uid in (campos.get("responsavel_id"), campos.get("revisor_id")):
        if uid and not con.execute("SELECT 1 FROM usuarios WHERE id=? AND ativo=1", (uid,)).fetchone():
            raise HTTPException(422, f"Usuário {uid} não existe ou está inativo.")
    con.execute(f"UPDATE prazos SET {','.join(f'{k}=?' for k in campos)}, atualizado_em=? WHERE id=?", (*campos.values(), relogio.agora_iso(), pid))
    for k, v in campos.items():
        if k != "data_interna" and str(p.get(k)) != str(v):
            ps.historico(con, pid, u["id"], "alterado" if k != "data_fatal" else f"data fatal alterada ({motivo.strip()})", k,
                         None if p.get(k) is None else str(p.get(k)), None if v is None else str(v))
    auditoria.registrar(con, u["id"], "prazo", pid, "alterado", ",".join(campos))
    return ver(pid, u, con)


class StatusIn(BaseModel):
    status: Literal["pendente", "em_andamento", "em_revisao", "concluido", "perdido", "cancelado"]


@router.post("/prazos/{pid}/status")
def definir_status(pid: int, d: StatusIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    ver(pid, u, con)  # checa acesso
    p = con.execute("SELECT * FROM prazos WHERE id=?", (pid,)).fetchone()
    ps.mudar_status(con, p, d.status, u)
    return ver(pid, u, con)
