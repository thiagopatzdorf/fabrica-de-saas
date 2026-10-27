"""Senhas (scrypt), sessão assinada (HMAC) e selo de assinatura."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from . import config

_N, _R, _P = 2**14, 8, 1


def hash_senha(senha: str) -> str:
    sal = secrets.token_bytes(16)
    h = hashlib.scrypt(senha.encode(), salt=sal, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${sal.hex()}${h.hex()}"


def conferir_senha(senha: str, armazenado: str) -> bool:
    try:
        _, n, r, p, sal, h = armazenado.split("$")
        calc = hashlib.scrypt(senha.encode(), salt=bytes.fromhex(sal), n=int(n), r=int(r), p=int(p), dklen=32)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(calc.hex(), h)


def _assinar(dados: bytes) -> str:
    return hmac.new(config.segredo(), dados, hashlib.sha256).hexdigest()


def _impressao(senha_hash: str) -> str:
    return hashlib.sha256(senha_hash.encode()).hexdigest()[:12]


def criar_sessao(usuario_id: int, senha_hash: str, validade_s: int = 12 * 3600) -> str:
    corpo = base64.urlsafe_b64encode(json.dumps(
        {"u": usuario_id, "exp": int(time.time()) + validade_s, "v": _impressao(senha_hash)}).encode()).decode()
    return f"{corpo}.{_assinar(corpo.encode())}"


def ler_sessao(token: str | None) -> dict | None:
    """Devolve {u, v} se a assinatura e a validade estão ok; quem confere `v` é o chamador
    (trocar a senha invalida as sessões antigas)."""
    if not token or "." not in token:
        return None
    corpo, assinatura = token.rsplit(".", 1)
    if not hmac.compare_digest(_assinar(corpo.encode()), assinatura):
        return None
    try:
        dados = json.loads(base64.urlsafe_b64decode(corpo.encode()))
    except (ValueError, json.JSONDecodeError):
        return None
    return dados if dados.get("exp", 0) > time.time() else None


def impressao_senha(senha_hash: str) -> str:
    return _impressao(senha_hash)


def selo(sha256: str, nome: str, documento: str, assinado_em: str, versao_id: int) -> str:
    """Selo HMAC que amarra arquivo + signatário + instante. Se o arquivo ou o registro
    mudarem, o selo deixa de bater."""
    return _assinar("|".join([sha256, nome, documento or "", assinado_em, str(versao_id)]).encode())


def novo_token() -> tuple[str, str]:
    """(token em claro para enviar ao signatário, hash para guardar)."""
    t = secrets.token_urlsafe(32)
    return t, hashlib.sha256(t.encode()).hexdigest()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
