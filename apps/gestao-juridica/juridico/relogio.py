"""Relógio do sistema. Um ponto só, para o teste fixar o "hoje" sem monkeypatch espalhado."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

# Brasil não tem horário de verão desde 2019: offset fixo evita depender de tzdata no servidor.
BRT = timezone(timedelta(hours=-3))


def agora() -> datetime:
    return datetime.now(BRT)


def hoje() -> date:
    return agora().date()


def agora_iso() -> str:
    return agora().isoformat(timespec="seconds")
