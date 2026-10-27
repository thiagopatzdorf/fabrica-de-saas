"""Regras de prazo: criação com cálculo, transições de status, perda automática e histórico."""
from __future__ import annotations

import sqlite3
from datetime import date

from fastapi import HTTPException

from . import alertas, auditoria, relogio
from .calendario import calcular_prazo, recuar_dias_uteis

ABERTOS = ("pendente", "em_andamento", "em_revisao")
PODE_TRABALHAR = ("pendente", "em_andamento")  # status em que o prazo ainda corre a favor de ser cumprido


def feriados_do_processo(con: sqlite3.Connection, processo: sqlite3.Row) -> frozenset[date]:
    linhas = con.execute("SELECT data FROM feriados WHERE tribunal='' OR tribunal=?", ((processo["tribunal"] or "").upper(),)).fetchall()
    return frozenset(date.fromisoformat(r["data"]) for r in linhas)


def historico(con: sqlite3.Connection, prazo_id: int, usuario_id: int | None, acao: str,
              campo: str | None = None, de: str | None = None, para: str | None = None) -> None:
    con.execute("INSERT INTO prazo_historico(prazo_id,usuario_id,acao,campo,de,para,em) VALUES(?,?,?,?,?,?,?)",
                (prazo_id, usuario_id, acao, campo, de, para, relogio.agora_iso()))


def criar(con: sqlite3.Connection, u: sqlite3.Row | None, processo: sqlite3.Row, *, descricao: str, categoria: str | None,
          evento: str, data_evento: date | None, dias: int | None, contagem: str, dobro: bool, suspender_recesso: bool,
          data_fatal: date | None, responsavel_id: int | None, revisor_id: int | None, margem_dias: int = 2,
          base_legal: str | None = None, publicacao_id: int | None = None) -> int:
    memoria = None
    if evento == "manual":
        if not data_fatal:
            raise HTTPException(422, "Informe a data fatal.")
        fatal = data_fatal
        memoria = "Data fatal informada manualmente."
    else:
        if not data_evento or not dias:
            raise HTTPException(422, "Informe a data do evento e a quantidade de dias.")
        r = calcular_prazo(data_evento, dias, evento=evento, contagem=contagem, dobro=dobro,
                           extras=feriados_do_processo(con, processo), suspender_recesso=suspender_recesso)
        fatal, memoria = r.data_fatal, "\n".join(r.memoria)
    for uid in (responsavel_id, revisor_id):
        if uid and not con.execute("SELECT 1 FROM usuarios WHERE id=? AND ativo=1", (uid,)).fetchone():
            raise HTTPException(422, f"Usuário {uid} não existe ou está inativo.")
    if responsavel_id and revisor_id and responsavel_id == revisor_id:
        raise HTTPException(422, "Revisor precisa ser diferente do responsável.")
    interna = recuar_dias_uteis(fatal, margem_dias, feriados_do_processo(con, processo)) if margem_dias else fatal
    agora = relogio.agora_iso()
    cur = con.execute(
        """INSERT INTO prazos(processo_id,descricao,categoria,evento,data_evento,dias,contagem,dobro,suspender_recesso,data_fatal,data_interna,
           margem_dias,responsavel_id,revisor_id,memoria_calculo,base_legal,publicacao_id,criado_por,criado_em,atualizado_em)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (processo["id"], descricao.strip(), categoria, evento, data_evento.isoformat() if data_evento else None, dias, contagem,
         int(dobro), int(suspender_recesso), fatal.isoformat(), interna.isoformat(), margem_dias, responsavel_id, revisor_id,
         memoria, base_legal, publicacao_id, u["id"] if u else None, agora, agora))
    pid = cur.lastrowid
    historico(con, pid, u["id"] if u else None, "criado", "data_fatal", None, fatal.isoformat())
    auditoria.registrar(con, u["id"] if u else None, "prazo", pid, "criado", fatal.isoformat())
    return pid


def novo_status(prazo: sqlite3.Row, desejado: str, u: sqlite3.Row) -> str:
    """Status que de fato resulta do pedido, ou HTTPException se não é permitido.

    Regras: `perdido` só o sistema aplica; com revisor, quem cumpre manda para `em_revisao` e só o
    revisor (ou admin) conclui; prazo concluído/cancelado só o admin reabre; cancelar exige advogado.
    """
    atual, papel = prazo["status"], u["papel"]
    admin = papel == "admin"
    revisor = prazo["revisor_id"] == u["id"]
    if desejado == atual:
        raise HTTPException(409, f"O prazo já está {atual}.")
    if desejado == "perdido":
        raise HTTPException(422, "Prazo perdido é marcado pelo sistema quando a data fatal passa sem cumprimento.")
    if atual in ("concluido", "cancelado"):
        if not admin:
            raise HTTPException(403, "Só o administrador reabre um prazo concluído ou cancelado.")
        if desejado not in ("pendente", "em_andamento"):
            raise HTTPException(422, "Para reabrir use pendente ou em_andamento.")
        return desejado
    if atual == "perdido" and desejado not in ("concluido", "cancelado"):
        raise HTTPException(422, "Prazo perdido só pode ser concluído (cumprido em atraso) ou cancelado.")
    if desejado == "cancelado":
        if papel not in ("admin", "advogado"):
            raise HTTPException(403, "Só advogado ou administrador cancela um prazo.")
        return "cancelado"
    if atual == "em_revisao" and desejado in ("concluido", "em_andamento", "pendente"):
        if not (admin or revisor):
            raise HTTPException(403, "Só o revisor do prazo aprova ou devolve a revisão.")
        return desejado
    if desejado == "concluido":
        if prazo["revisor_id"] and not (admin or revisor):
            return "em_revisao"
        return "concluido"
    if desejado == "em_revisao":
        if not prazo["revisor_id"]:
            raise HTTPException(422, "Este prazo não tem revisor.")
        return "em_revisao"
    return desejado


def mudar_status(con: sqlite3.Connection, prazo: sqlite3.Row, desejado: str, u: sqlite3.Row) -> str:
    final = novo_status(prazo, desejado, u)
    agora = relogio.agora_iso()
    if final == "concluido":
        con.execute("UPDATE prazos SET status=?,concluido_em=?,concluido_por=?,atualizado_em=? WHERE id=?", (final, agora, u["id"], agora, prazo["id"]))
    else:
        con.execute("UPDATE prazos SET status=?,concluido_em=NULL,concluido_por=NULL,atualizado_em=? WHERE id=?", (final, agora, prazo["id"]))
    nota = "cumprido após a data fatal" if final == "concluido" and prazo["status"] == "perdido" else None
    historico(con, prazo["id"], u["id"], "status", "status", prazo["status"], final if not nota else f"{final} ({nota})")
    auditoria.registrar(con, u["id"], "prazo", prazo["id"], "status", final)
    return final


def marcar_perdidos(con: sqlite3.Connection, hoje: date | None = None) -> int:
    """Passa a `perdido` o que venceu sem ser cumprido. Idempotente; roda a cada leitura relevante."""
    hoje = hoje or relogio.hoje()
    vencidos = con.execute("SELECT * FROM prazos WHERE status IN('pendente','em_andamento') AND data_fatal<?", (hoje.isoformat(),)).fetchall()
    for p in vencidos:
        con.execute("UPDATE prazos SET status='perdido',atualizado_em=? WHERE id=?", (relogio.agora_iso(), p["id"]))
        historico(con, p["id"], None, "status", "status", p["status"], "perdido")
        alertas.alertar_perdido(con, p)
    return len(vencidos)


def dias_ate(data_fatal: str, hoje: date | None = None) -> int:
    return (date.fromisoformat(data_fatal) - (hoje or relogio.hoje())).days
