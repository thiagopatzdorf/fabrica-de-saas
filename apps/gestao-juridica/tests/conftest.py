import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

SENHA = "senha-de-teste-123"


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGAL_DATA_DIR", str(tmp_path / "dados"))
    monkeypatch.setenv("LEGAL_SECRET", "segredo-de-teste-que-nao-e-de-producao")
    monkeypatch.setenv("LEGAL_ADMIN_EMAIL", "admin@teste.local")
    monkeypatch.setenv("LEGAL_ADMIN_SENHA", SENHA)
    monkeypatch.delenv("DATAJUD_API_KEY", raising=False)
    from juridico import api_basico
    from juridico.app import create_app

    api_basico._TENTATIVAS.clear()
    return create_app()


def _logar(app, email, senha=SENHA):
    c = TestClient(app)
    r = c.post("/api/login", json={"email": email, "senha": senha})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['token']}"
    c.cookies.clear()
    return c


@pytest.fixture
def admin(app):
    return _logar(app, "admin@teste.local")


@pytest.fixture
def novo_usuario(app, admin):
    def criar(papel="advogado", nome=None, **extra):
        n = nome or f"{papel.title()} {len(admin.get('/api/usuarios').json())}"
        email = f"{n.lower().replace(' ', '.')}@teste.local"
        r = admin.post("/api/usuarios", json={"nome": n, "email": email, "senha": SENHA, "papel": papel, **extra})
        assert r.status_code == 201, r.text
        c = _logar(app, email)
        c.usuario = r.json()
        return c
    return criar


@pytest.fixture
def advogado(novo_usuario):
    return novo_usuario("advogado", "Ana Advogada", oab="SP123456")


@pytest.fixture
def cliente(advogado):
    r = advogado.post("/api/clientes", json={"tipo_pessoa": "PF", "nome": "Maria da Silva", "documento": "529.982.247-25",
                                             "email": "maria@exemplo.com", "endereco": "Rua A, 10, São Paulo/SP"})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def processo(advogado, cliente):
    from juridico import cnj

    r = advogado.post("/api/processos", json={"cliente_id": cliente["id"], "numero": cnj.gerar(1234567, 2023, 8, 26, 100),
                                              "vara": "1ª Vara Cível", "comarca": "São Paulo", "classe": "Procedimento Comum", "assunto": "Indenização por danos morais"})
    assert r.status_code == 201, r.text
    return r.json()
