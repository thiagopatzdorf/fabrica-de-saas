"""Apoio dos testes: tudo roda sem rede, em cópia temporária da fixture."""
import contextlib
import io
import shutil
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
FIXTURE = AQUI / "fixtures" / "raiz"
API_FIXTURE = AQUI / "fixtures" / "api.json"
sys.path.insert(0, str(RAIZ / "scripts"))

import catalogo as cat  # noqa: E402
import gerar  # noqa: E402
import verificar  # noqa: E402


def copia_fixture() -> Path:
    """Cópia da fixture num diretório temporário; o chamador apaga com shutil.rmtree."""
    d = Path(tempfile.mkdtemp(prefix="fds-teste-"))
    shutil.copytree(FIXTURE, d, dirs_exist_ok=True)
    return d


def rodar(modulo, *args, **kw):
    """Roda principal() capturando stdout/stderr. Devolve (codigo, stdout, stderr)."""
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        codigo = modulo.principal(list(args), **kw)
    return codigo, out.getvalue(), err.getvalue()


def raiz_verificada_e_gerada() -> Path:
    """Fixture completa: verificar --fixture e depois gerar."""
    d = copia_fixture()
    assert rodar(verificar, "--raiz", str(d), "--fixture", str(API_FIXTURE))[0] == 0
    assert rodar(gerar, "--raiz", str(d))[0] == 0
    return d


def item_valido(**mudancas) -> dict:
    base = {"repo": "dono/nome", "nome": "Nome", "alternativa_a": ["X"], "pt": "Frase em português.",
            "en": "English sentence.", "stack": ["Go"]}
    base.update(mudancas)
    return {k: v for k, v in base.items() if v is not None}


def categoria_valida(slug="demo", itens=None) -> dict:
    return {"categoria": slug, "titulo_pt": "Demo", "titulo_en": "Demo", "itens": itens or [item_valido()]}
