"""Agenda: eventos próprios + prazos, em visão de dia, semana ou mês, com filtros."""
from __future__ import annotations

import calendar
import sqlite3
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import acesso, auditoria, relogio
from .deps import EDITORES, get_db, usuario_atual

router = APIRouter(prefix="/api")
TIPOS = ("audiencia", "reuniao", "sustentacao_oral", "compromisso", "pericia", "diligencia", "vencimento_financeiro")
Tipo = Literal["audiencia", "reuniao", "sustentacao_oral", "compromisso", "pericia", "diligencia", "vencimento_financeiro"]


def intervalo(visao: str, ref: date) -> tuple[date, date]:
    """Dia = o dia; semana = segunda a domingo; mês = do dia 1 ao último."""
    if visao == "dia":
        return ref, ref
    if visao == "semana":
        ini = ref - timedelta(days=ref.weekday())
        return ini, ini + timedelta(days=6)
    if visao == "mes":
        return ref.replace(day=1), ref.replace(day=calendar.monthrange(ref.year, ref.month)[1])
    raise HTTPException(422, "visao deve ser dia, semana ou mes.")


def _norm_inicio(valor: datetime | date, dia_inteiro: bool) -> str:
    if isinstance(valor, datetime):
        if valor.tzinfo:
            valor = valor.astimezone(relogio.BRT).replace(tzinfo=None)
        return valor.date().isoformat() if dia_inteiro else valor.isoformat(timespec="minutes")
    return valor.isoformat()


class EventoIn(BaseModel):
    tipo: Tipo
    titulo: str = Field(min_length=2)
    inicio: datetime
    fim: datetime | None = None
    dia_inteiro: bool = False
    local: str | None = None
    descricao: str | None = None
    processo_id: int | None = None
    cliente_id: int | None = None
    responsavel_id: int | None = None
    valor_centavos: int | None = Field(default=None, ge=0)


class EventoPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=2)
    inicio: datetime | None = None
    fim: datetime | None = None
    dia_inteiro: bool | None = None
    local: str | None = None
    descricao: str | None = None
    responsavel_id: int | None = None
    valor_centavos: int | None = Field(default=None, ge=0)
    concluido: bool | None = None


def _pode_tipo(u: sqlite3.Row, tipo: str) -> None:
    if u["papel"] == "financeiro" and tipo != "vencimento_financeiro":
        raise HTTPException(403, "O perfil financeiro só cria vencimentos financeiros.")
    if u["papel"] not in (*EDITORES, "financeiro"):
        raise HTTPException(403, "Sem permissão.")


@router.get("/agenda")
def agenda(visao: Literal["dia", "semana", "mes"] = "semana", data: date | None = None, de: date | None = None, ate: date | None = None,
           advogado_id: int = 0, cliente_id: int = 0, processo_id: int = 0, tipos: str = "",
           u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    ini, fim = (de, ate) if de and ate else intervalo(visao, data or relogio.hoje())
    filtro_tipos = [t for t in tipos.split(",") if t]
    itens: list[dict] = []
    base = {"papel": u["papel"], "uid": u["id"], "ini": ini.isoformat(), "fim": fim.isoformat()}
    cond_e = ["substr(e.inicio,1,10) BETWEEN :ini AND :fim", "(e.processo_id IS NULL OR " + acesso.visivel("pr") + ")"]
    args_e = dict(base)
    for coluna, valor, nome in (("e.responsavel_id", advogado_id, "adv"), ("coalesce(e.cliente_id,pr.cliente_id)", cliente_id, "cli"),
                                ("e.processo_id", processo_id, "proc")):
        if valor:
            cond_e.append(f"{coluna}=:{nome}")
            args_e[nome] = valor
    for e in con.execute(f"""SELECT e.*, pr.numero AS processo_numero, c.nome AS cliente_nome, us.nome AS responsavel_nome FROM eventos e
                             LEFT JOIN processos pr ON pr.id=e.processo_id LEFT JOIN clientes c ON c.id=coalesce(e.cliente_id,pr.cliente_id)
                             LEFT JOIN usuarios us ON us.id=e.responsavel_id WHERE {' AND '.join(cond_e)}""", args_e):
        if u["papel"] == "financeiro" and e["tipo"] != "vencimento_financeiro":
            continue
        itens.append({"origem": "evento", "id": e["id"], "tipo": e["tipo"], "titulo": e["titulo"], "inicio": e["inicio"], "fim": e["fim"],
                      "dia_inteiro": bool(e["dia_inteiro"]), "local": e["local"], "processo_id": e["processo_id"],
                      "processo_numero": e["processo_numero"], "cliente_nome": e["cliente_nome"], "responsavel_id": e["responsavel_id"],
                      "responsavel_nome": e["responsavel_nome"], "valor_centavos": e["valor_centavos"], "concluido": bool(e["concluido"])})
    if u["papel"] != "financeiro" and (not filtro_tipos or "prazo" in filtro_tipos):
        cond_p = ["pz.data_fatal BETWEEN :ini AND :fim", "pz.status!='cancelado'", acesso.visivel("pr")]
        args_p = dict(base)
        for coluna, valor, nome in (("pz.responsavel_id", advogado_id, "adv"), ("pr.cliente_id", cliente_id, "cli"), ("pz.processo_id", processo_id, "proc")):
            if valor:
                cond_p.append(f"{coluna}=:{nome}")
                args_p[nome] = valor
        for p in con.execute(f"""SELECT pz.*, pr.numero AS processo_numero, c.nome AS cliente_nome, us.nome AS responsavel_nome FROM prazos pz
                                 JOIN processos pr ON pr.id=pz.processo_id JOIN clientes c ON c.id=pr.cliente_id
                                 LEFT JOIN usuarios us ON us.id=pz.responsavel_id WHERE {' AND '.join(cond_p)}""", args_p):
            itens.append({"origem": "prazo", "id": p["id"], "tipo": "prazo", "titulo": p["descricao"], "inicio": p["data_fatal"], "fim": None,
                          "dia_inteiro": True, "local": None, "processo_id": p["processo_id"], "processo_numero": p["processo_numero"],
                          "cliente_nome": p["cliente_nome"], "responsavel_id": p["responsavel_id"], "responsavel_nome": p["responsavel_nome"],
                          "valor_centavos": None, "status": p["status"], "concluido": p["status"] == "concluido"})
    if filtro_tipos:
        itens = [i for i in itens if i["tipo"] in filtro_tipos]
    itens.sort(key=lambda i: (i["inicio"][:10], 0 if i["dia_inteiro"] else 1, i["inicio"], i["titulo"]))
    return {"de": ini.isoformat(), "ate": fim.isoformat(), "visao": visao, "itens": itens}


@router.post("/eventos", status_code=201)
def criar_evento(d: EventoIn, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    _pode_tipo(u, d.tipo)
    cliente_id = d.cliente_id
    if d.processo_id:
        proc = acesso.carregar_processo(con, u, d.processo_id)
        cliente_id = cliente_id or proc["cliente_id"]
    if cliente_id and not con.execute("SELECT 1 FROM clientes WHERE id=?", (cliente_id,)).fetchone():
        raise HTTPException(422, "Cliente não encontrado.")
    if d.tipo == "vencimento_financeiro" and d.valor_centavos is None:
        raise HTTPException(422, "Vencimento financeiro precisa do valor.")
    if d.fim and d.fim < d.inicio:
        raise HTTPException(422, "O fim não pode ser antes do início.")
    resp = d.responsavel_id or u["id"]
    if not con.execute("SELECT 1 FROM usuarios WHERE id=? AND ativo=1", (resp,)).fetchone():
        raise HTTPException(422, "Responsável não encontrado.")
    cur = con.execute("""INSERT INTO eventos(tipo,titulo,inicio,fim,dia_inteiro,local,descricao,processo_id,cliente_id,responsavel_id,valor_centavos,criado_por,criado_em)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                      (d.tipo, d.titulo.strip(), _norm_inicio(d.inicio, d.dia_inteiro), _norm_inicio(d.fim, d.dia_inteiro) if d.fim else None,
                       int(d.dia_inteiro), d.local, d.descricao, d.processo_id, cliente_id, resp, d.valor_centavos, u["id"], relogio.agora_iso()))
    auditoria.registrar(con, u["id"], "evento", cur.lastrowid, "criado", d.tipo)
    return _evento(con, cur.lastrowid)


def _evento(con: sqlite3.Connection, eid: int) -> dict:
    e = con.execute("SELECT * FROM eventos WHERE id=?", (eid,)).fetchone()
    if not e:
        raise HTTPException(404, "Evento não encontrado.")
    return {k: e[k] for k in e.keys()} | {"dia_inteiro": bool(e["dia_inteiro"]), "concluido": bool(e["concluido"])}


@router.get("/eventos/{eid}")
def ver_evento(eid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    e = _evento(con, eid)
    if e["processo_id"] and not acesso.pode_ver(con, u, e["processo_id"]):
        raise HTTPException(404, "Evento não encontrado.")
    return e


@router.patch("/eventos/{eid}")
def alterar_evento(eid: int, d: EventoPatch, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    e = ver_evento(eid, u, con)
    _pode_tipo(u, e["tipo"])
    campos = d.model_dump(exclude_unset=True)
    di = campos.get("dia_inteiro", e["dia_inteiro"])
    for k in ("inicio", "fim"):
        if campos.get(k):
            campos[k] = _norm_inicio(campos[k], di)
    for k in ("dia_inteiro", "concluido"):
        if k in campos:
            campos[k] = int(campos[k])
    if campos:
        con.execute(f"UPDATE eventos SET {','.join(f'{k}=?' for k in campos)} WHERE id=?", (*campos.values(), eid))
        auditoria.registrar(con, u["id"], "evento", eid, "alterado", ",".join(campos))
    return _evento(con, eid)


@router.delete("/eventos/{eid}")
def apagar_evento(eid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    e = ver_evento(eid, u, con)
    _pode_tipo(u, e["tipo"])
    if u["papel"] not in ("admin", "advogado") and e["criado_por"] != u["id"]:
        raise HTTPException(403, "Só quem criou, um advogado ou o administrador apaga o evento.")
    con.execute("DELETE FROM eventos WHERE id=?", (eid,))
    auditoria.registrar(con, u["id"], "evento", eid, "removido", e["titulo"])
    return {"ok": True}
