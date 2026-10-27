"""Configuração por ambiente. Nada de caminho de máquina no código."""
from __future__ import annotations

import os
import secrets
from pathlib import Path

RAIZ_APP = Path(__file__).resolve().parents[1]


def dir_dados() -> Path:
    p = Path(os.environ.get("LEGAL_DATA_DIR") or RAIZ_APP / "data")
    p.mkdir(parents=True, exist_ok=True)
    return p


def caminho_banco() -> Path:
    return dir_dados() / "juridico.db"


def dir_arquivos() -> Path:
    p = dir_dados() / "arquivos"
    p.mkdir(parents=True, exist_ok=True)
    return p


def segredo() -> bytes:
    """Chave de assinatura de sessões e selos. Vem do ambiente; sem ela, nasce uma e fica
    no diretório de dados (0600), para o servidor sobreviver a reinício sem invalidar tudo."""
    env = os.environ.get("LEGAL_SECRET")
    if env:
        return env.encode()
    arq = dir_dados() / "segredo.key"
    if not arq.exists():
        arq.write_text(secrets.token_hex(32))
        arq.chmod(0o600)
    return arq.read_text().strip().encode()


def cookie_seguro() -> bool:
    """Cookie `Secure` por padrão; só desliga explicitamente (desenvolvimento em http)."""
    return os.environ.get("LEGAL_COOKIE_INSEGURO") != "1"


LIMITE_UPLOAD = int(os.environ.get("LEGAL_LIMITE_UPLOAD_MB", "50")) * 1024 * 1024
EXTENSOES_PERMITIDAS = {".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md", ".csv", ".xls", ".xlsx",
                        ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".eml", ".msg", ".zip", ".mp3", ".mp4", ".html"}
