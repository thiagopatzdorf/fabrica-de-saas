"""Alertas de prazo e de agenda: caixa de saída idempotente + entrega por canal.

Gerar não envia; enviar não recalcula. `UNIQUE(origem, origem_id, usuario, canal, antecedencia)`
garante que rodar o ciclo duas vezes no mesmo dia não manda duas mensagens.
Canal sem provedor configurado fica em `sem_provedor` (visível), nunca como "enviado".
"""
from __future__ import annotations

import json
import os
import smtplib
import sqlite3
import urllib.request
from collections.abc import Callable
from datetime import date, datetime, timedelta
from email.message import EmailMessage

from . import relogio

ANTECEDENCIA_PRAZO = (7, 3, 1, 0)
ANTECEDENCIA_EVENTO = (1, 0)
HORA_ENVIO = "08:00:00-03:00"

Enviador = Callable[[sqlite3.Row, str, str], None]


def _quando(dias: int) -> str:
    return "hoje" if dias == 0 else "amanhã" if dias == 1 else f"em {dias} dias"


def _destinatarios(con: sqlite3.Connection, ids: list[int | None]):
    for uid in dict.fromkeys(i for i in ids if i):
        u = con.execute("SELECT * FROM usuarios WHERE id=? AND ativo=1", (uid,)).fetchone()
        if u:
            for canal in u["canais_alerta"].split(","):
                if canal == "whatsapp" and not u["telefone"]:
                    continue
                yield u, canal


def _inserir(con, origem, origem_id, usuario_id, canal, antecedencia, enviar_em, mensagem) -> None:
    con.execute("INSERT OR IGNORE INTO alertas(origem,origem_id,usuario_id,canal,antecedencia_dias,enviar_em,mensagem,criado_em) VALUES(?,?,?,?,?,?,?,?)",
                (origem, origem_id, usuario_id, canal, antecedencia, enviar_em, mensagem, relogio.agora_iso()))


def gerar_alertas(con: sqlite3.Connection, hoje: date | None = None) -> int:
    hoje = hoje or relogio.hoje()
    antes = con.total_changes
    for p in con.execute("""SELECT pz.*, pr.numero FROM prazos pz JOIN processos pr ON pr.id=pz.processo_id
                            WHERE pz.status IN('pendente','em_andamento','em_revisao')""").fetchall():
        fatal = date.fromisoformat(p["data_fatal"])
        # Em revisão o trabalho já foi feito: quem precisa agir é o revisor.
        donos = [p["revisor_id"]] if p["status"] == "em_revisao" else [p["responsavel_id"], p["revisor_id"]]
        for a in ANTECEDENCIA_PRAZO:
            dia = fatal - timedelta(days=a)
            if dia < hoje:
                continue
            msg = f"Prazo vence {_quando(a)} ({fatal.strftime('%d/%m/%Y')}): {p['descricao']}" + (f" — proc. {p['numero']}" if p["numero"] else "")
            for u, canal in _destinatarios(con, donos):
                _inserir(con, "prazo", p["id"], u["id"], canal, a, f"{dia.isoformat()}T{HORA_ENVIO}", msg)
    for e in con.execute("SELECT * FROM eventos WHERE concluido=0").fetchall():
        inicio = date.fromisoformat(e["inicio"][:10])
        for a in ANTECEDENCIA_EVENTO:
            dia = inicio - timedelta(days=a)
            if dia < hoje:
                continue
            hora = f" às {e['inicio'][11:16]}" if len(e["inicio"]) > 10 else ""
            msg = f"{e['titulo']} {_quando(a)} ({inicio.strftime('%d/%m/%Y')}{hora})" + (f" — {e['local']}" if e["local"] else "")
            for u, canal in _destinatarios(con, [e["responsavel_id"]]):
                _inserir(con, "evento", e["id"], u["id"], canal, a, f"{dia.isoformat()}T{HORA_ENVIO}", msg)
    return con.total_changes - antes


def alertar_perdido(con: sqlite3.Connection, prazo: sqlite3.Row) -> None:
    msg = f"PRAZO PERDIDO ({date.fromisoformat(prazo['data_fatal']).strftime('%d/%m/%Y')}): {prazo['descricao']}"
    for u, canal in _destinatarios(con, [prazo["responsavel_id"], prazo["revisor_id"]]):
        _inserir(con, "prazo", prazo["id"], u["id"], canal, -1, relogio.agora_iso(), msg)


# ---------- entrega ----------
def _enviador_email() -> Enviador | None:
    host = os.environ.get("LEGAL_SMTP_HOST")
    if not host:
        return None

    def enviar(usuario: sqlite3.Row, assunto: str, texto: str) -> None:
        m = EmailMessage()
        m["From"] = os.environ.get("LEGAL_SMTP_DE", "alertas@localhost")
        m["To"], m["Subject"] = usuario["email"], assunto
        m.set_content(texto)
        with smtplib.SMTP(host, int(os.environ.get("LEGAL_SMTP_PORTA", "587")), timeout=20) as s:
            if os.environ.get("LEGAL_SMTP_STARTTLS", "1") == "1":
                s.starttls()
            if os.environ.get("LEGAL_SMTP_USUARIO"):
                s.login(os.environ["LEGAL_SMTP_USUARIO"], os.environ.get("LEGAL_SMTP_SENHA", ""))
            s.send_message(m)
    return enviar


def _enviador_whatsapp() -> Enviador | None:
    url = os.environ.get("LEGAL_WHATSAPP_WEBHOOK_URL")
    if not url:
        return None

    def enviar(usuario: sqlite3.Row, assunto: str, texto: str) -> None:
        cab = {"Content-Type": "application/json"}
        if os.environ.get("LEGAL_WHATSAPP_TOKEN"):
            cab["Authorization"] = f"Bearer {os.environ['LEGAL_WHATSAPP_TOKEN']}"
        req = urllib.request.Request(url, data=json.dumps({"telefone": usuario["telefone"], "mensagem": texto}).encode(), headers=cab, method="POST")
        urllib.request.urlopen(req, timeout=20).read()  # noqa: S310
    return enviar


def enviadores_do_ambiente() -> dict[str, Enviador | None]:
    return {"email": _enviador_email(), "whatsapp": _enviador_whatsapp()}


def _obsoleto(con: sqlite3.Connection, a: sqlite3.Row) -> bool:
    if a["antecedencia_dias"] == -1:
        return False
    if a["origem"] == "prazo":
        r = con.execute("SELECT status FROM prazos WHERE id=?", (a["origem_id"],)).fetchone()
        return not r or r["status"] not in ("pendente", "em_andamento", "em_revisao")
    r = con.execute("SELECT concluido FROM eventos WHERE id=?", (a["origem_id"],)).fetchone()
    return not r or bool(r["concluido"])


def entregar_alertas(con: sqlite3.Connection, agora: datetime | None = None, enviadores: dict[str, Enviador | None] | None = None) -> dict:
    agora_iso = (agora or relogio.agora()).isoformat(timespec="seconds")
    enviadores = enviadores if enviadores is not None else enviadores_do_ambiente()
    r = {"enviado": 0, "falhou": 0, "sem_provedor": 0, "obsoleto": 0}
    for a in con.execute("SELECT * FROM alertas WHERE (status IN('pendente','sem_provedor') OR (status='falhou' AND tentativas<3)) AND enviar_em<=?", (agora_iso,)).fetchall():
        if _obsoleto(con, a):
            con.execute("DELETE FROM alertas WHERE id=?", (a["id"],))
            r["obsoleto"] += 1
            continue
        if a["canal"] == "app":
            con.execute("UPDATE alertas SET status='enviado' WHERE id=?", (a["id"],))
            r["enviado"] += 1
            continue
        envio = enviadores.get(a["canal"])
        if not envio:
            con.execute("UPDATE alertas SET status='sem_provedor' WHERE id=?", (a["id"],))
            r["sem_provedor"] += 1
            continue
        u = con.execute("SELECT * FROM usuarios WHERE id=?", (a["usuario_id"],)).fetchone()
        try:
            envio(u, "Alerta do escritório", a["mensagem"])
            con.execute("UPDATE alertas SET status='enviado',tentativas=tentativas+1,erro=NULL WHERE id=?", (a["id"],))
            r["enviado"] += 1
        except Exception as e:  # provedor externo: qualquer falha vira status visível, nunca derruba o ciclo
            con.execute("UPDATE alertas SET status='falhou',tentativas=tentativas+1,erro=? WHERE id=?", (str(e)[:300], a["id"]))
            r["falhou"] += 1
    return r
