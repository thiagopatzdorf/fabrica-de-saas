"""Painel do dia e caixa de alertas do usuário."""
from __future__ import annotations

import sqlite3
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from . import acesso, relogio
from . import prazos_servico as ps
from .deps import get_db, usuario_atual

router = APIRouter(prefix="/api")


@router.get("/painel")
def painel(u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    ps.marcar_perdidos(con)
    hoje = relogio.hoje()
    a = {"papel": u["papel"], "uid": u["id"], "hoje": hoje.isoformat(), "semana": (hoje + timedelta(days=7)).isoformat(),
         "trinta": (hoje - timedelta(days=30)).isoformat()}
    vis = acesso.visivel("pr")
    base = f"""FROM prazos pz JOIN processos pr ON pr.id=pz.processo_id JOIN clientes c ON c.id=pr.cliente_id WHERE {vis}"""
    campos = "pz.id,pz.descricao,pz.data_fatal,pz.status,pr.id AS processo_id,pr.numero AS processo_numero,c.nome AS cliente_nome"
    abertos = "pz.status IN('pendente','em_andamento','em_revisao')"
    def q(extra: str, lim: int = 50) -> list[dict]:
        linhas = con.execute(f"SELECT {campos} {base} AND {extra} ORDER BY pz.data_fatal LIMIT {lim}", a).fetchall()
        return [dict(r) | {"dias_restantes": ps.dias_ate(r["data_fatal"], hoje)} for r in linhas]

    fases = con.execute(f"SELECT p.fase,COUNT(*) AS n FROM processos p WHERE p.status='ativo' AND {acesso.visivel()} GROUP BY p.fase ORDER BY n DESC", a).fetchall()
    ev = con.execute(f"""SELECT e.id,e.tipo,e.titulo,e.inicio,e.local FROM eventos e LEFT JOIN processos pr ON pr.id=e.processo_id
                         WHERE e.concluido=0 AND substr(e.inicio,1,10) BETWEEN :hoje AND :semana
                         AND (e.processo_id IS NULL OR {vis}) ORDER BY e.inicio LIMIT 20""", a).fetchall()
    return {
        "hoje": hoje.isoformat(),
        "prazos_hoje": q(f"{abertos} AND pz.data_fatal=:hoje"),
        "prazos_semana": q(f"{abertos} AND pz.data_fatal>:hoje AND pz.data_fatal<=:semana"),
        "prazos_perdidos": q("pz.status='perdido' AND pz.data_fatal>=:trinta"),
        "aguardando_minha_revisao": q("pz.status='em_revisao' AND pz.revisor_id=:uid"),
        "proximos_eventos": [dict(e) for e in ev if u["papel"] != "financeiro" or e["tipo"] == "vencimento_financeiro"],
        "processos_por_fase": [dict(f) for f in fases],
        "publicacoes_novas": con.execute("SELECT COUNT(*) FROM publicacoes WHERE status IN('nova','vinculada')").fetchone()[0] if u["papel"] != "financeiro" else 0,
        "alertas_nao_lidos": con.execute("SELECT COUNT(*) FROM alertas WHERE usuario_id=? AND canal='app' AND status='enviado'", (u["id"],)).fetchone()[0],
    }


@router.get("/alertas")
def meus_alertas(todos: bool = False, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    filtro = "" if todos else "AND status='enviado'"
    return [dict(r) for r in con.execute(
        f"SELECT id,origem,origem_id,mensagem,enviar_em,status FROM alertas WHERE usuario_id=? AND canal='app' AND status IN('enviado','lido') {filtro} "
        "ORDER BY enviar_em DESC LIMIT 100", (u["id"],))]


@router.post("/alertas/{aid}/lido")
def marcar_lido(aid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("UPDATE alertas SET status='lido' WHERE id=? AND usuario_id=? AND canal='app'", (aid, u["id"])).rowcount:
        raise HTTPException(404, "Alerta não encontrado.")
    return {"ok": True}
