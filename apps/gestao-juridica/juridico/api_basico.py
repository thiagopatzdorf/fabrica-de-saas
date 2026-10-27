"""Login, usuários, clientes e feriados locais."""
from __future__ import annotations

import sqlite3
import time
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import auditoria, config, relogio, seguranca
from .deps import EDITORES, exigir_papel, get_db, usuario_atual
from .documentos_br import documento_valido, formatar_documento, so_digitos

router = APIRouter(prefix="/api")

_TENTATIVAS: dict[str, list[float]] = {}
_MAX_TENTATIVAS, _JANELA_S = 5, 300


def _limite_login(chave: str) -> None:
    agora = time.time()
    recentes = [t for t in _TENTATIVAS.get(chave, []) if agora - t < _JANELA_S]
    _TENTATIVAS[chave] = recentes
    if len(recentes) >= _MAX_TENTATIVAS:
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.")


def _publico(u: sqlite3.Row, completo: bool = True) -> dict:
    d = {"id": u["id"], "nome": u["nome"], "papel": u["papel"], "oab": u["oab"]}
    if completo:
        d |= {"email": u["email"], "telefone": u["telefone"], "ativo": bool(u["ativo"]), "canais_alerta": u["canais_alerta"]}
    return d


class LoginIn(BaseModel):
    email: str
    senha: str


@router.post("/login")
def login(dados: LoginIn, request: Request, resp: Response, con: sqlite3.Connection = Depends(get_db)):
    chave = f"{(request.client.host if request.client else '?')}|{dados.email.lower()}"
    _limite_login(chave)
    u = con.execute("SELECT * FROM usuarios WHERE email=? AND ativo=1", (dados.email.strip(),)).fetchone()
    if not u or not seguranca.conferir_senha(dados.senha, u["senha_hash"]):
        _TENTATIVAS.setdefault(chave, []).append(time.time())
        raise HTTPException(401, "E-mail ou senha incorretos.")
    _TENTATIVAS.pop(chave, None)
    token = seguranca.criar_sessao(u["id"], u["senha_hash"])
    resp.set_cookie("sessao", token, httponly=True, samesite="strict", secure=config.cookie_seguro(), max_age=12 * 3600)
    auditoria.registrar(con, u["id"], "usuario", u["id"], "login")
    return {"usuario": _publico(u), "token": token}


@router.post("/logout")
def logout(resp: Response):
    resp.delete_cookie("sessao")
    return {"ok": True}


@router.get("/eu")
def eu(u: sqlite3.Row = Depends(usuario_atual)):
    return _publico(u)


class PerfilPatch(BaseModel):
    nome: str | None = Field(default=None, min_length=2)
    telefone: str | None = None
    oab: str | None = None
    canais_alerta: str | None = None
    senha_atual: str | None = None
    senha_nova: str | None = Field(default=None, min_length=10)


@router.patch("/eu")
def alterar_perfil(d: PerfilPatch, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    """O próprio usuário ajusta contato e canais de alerta; trocar a senha exige a senha atual."""
    campos = d.model_dump(exclude_unset=True, exclude={"senha_atual", "senha_nova"})
    if "canais_alerta" in campos:
        campos["canais_alerta"] = _canais_validos(campos["canais_alerta"])
    if d.senha_nova:
        if not d.senha_atual or not seguranca.conferir_senha(d.senha_atual, u["senha_hash"]):
            raise HTTPException(401, "Senha atual incorreta.")
        campos["senha_hash"] = seguranca.hash_senha(d.senha_nova)
    if campos:
        con.execute(f"UPDATE usuarios SET {','.join(f'{k}=?' for k in campos)} WHERE id=?", (*campos.values(), u["id"]))
        auditoria.registrar(con, u["id"], "usuario", u["id"], "perfil", ",".join(k for k in campos if k != "senha_hash"))
    return _publico(con.execute("SELECT * FROM usuarios WHERE id=?", (u["id"],)).fetchone())


# ---------- usuários ----------
class UsuarioIn(BaseModel):
    nome: str = Field(min_length=2)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    senha: str = Field(min_length=10, description="mínimo de 10 caracteres")
    papel: Literal["admin", "advogado", "estagiario", "financeiro"] = "advogado"
    oab: str | None = None
    telefone: str | None = None
    canais_alerta: str = "app,email"


class UsuarioPatch(BaseModel):
    nome: str | None = None
    papel: Literal["admin", "advogado", "estagiario", "financeiro"] | None = None
    oab: str | None = None
    telefone: str | None = None
    ativo: bool | None = None
    senha: str | None = Field(default=None, min_length=10)
    canais_alerta: str | None = None


def _canais_validos(texto: str) -> str:
    canais = [c.strip() for c in texto.split(",") if c.strip()]
    if not canais or any(c not in {"app", "email", "whatsapp"} for c in canais):
        raise HTTPException(422, "canais_alerta aceita: app, email, whatsapp (separados por vírgula).")
    return ",".join(dict.fromkeys(canais))


@router.get("/usuarios")
def listar_usuarios(u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    linhas = con.execute("SELECT * FROM usuarios WHERE ativo=1 OR ?='admin' ORDER BY nome", (u["papel"],)).fetchall()
    return [_publico(x, completo=u["papel"] == "admin") for x in linhas]


@router.post("/usuarios", status_code=201)
def criar_usuario(d: UsuarioIn, admin: sqlite3.Row = Depends(exigir_papel("admin")), con: sqlite3.Connection = Depends(get_db)):
    if con.execute("SELECT 1 FROM usuarios WHERE email=?", (d.email,)).fetchone():
        raise HTTPException(409, "Já existe usuário com este e-mail.")
    cur = con.execute("INSERT INTO usuarios(nome,email,senha_hash,papel,oab,telefone,canais_alerta,criado_em) VALUES(?,?,?,?,?,?,?,?)",
                      (d.nome, d.email, seguranca.hash_senha(d.senha), d.papel, d.oab, d.telefone,
                       _canais_validos(d.canais_alerta), relogio.agora_iso()))
    auditoria.registrar(con, admin["id"], "usuario", cur.lastrowid, "criado", d.papel)
    return _publico(con.execute("SELECT * FROM usuarios WHERE id=?", (cur.lastrowid,)).fetchone())


@router.patch("/usuarios/{uid}")
def alterar_usuario(uid: int, d: UsuarioPatch, admin: sqlite3.Row = Depends(exigir_papel("admin")),
                    con: sqlite3.Connection = Depends(get_db)):
    alvo = con.execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
    if not alvo:
        raise HTTPException(404, "Usuário não encontrado.")
    campos = d.model_dump(exclude_unset=True)
    if uid == admin["id"] and (campos.get("ativo") is False or ("papel" in campos and campos["papel"] != "admin")):
        raise HTTPException(409, "Você não pode remover o próprio acesso de administrador.")
    if "senha" in campos:
        campos["senha_hash"] = seguranca.hash_senha(campos.pop("senha"))
    if "canais_alerta" in campos:
        campos["canais_alerta"] = _canais_validos(campos["canais_alerta"])
    if "ativo" in campos:
        campos["ativo"] = int(campos["ativo"])
    if campos:
        con.execute(f"UPDATE usuarios SET {','.join(f'{k}=?' for k in campos)} WHERE id=?", (*campos.values(), uid))
        auditoria.registrar(con, admin["id"], "usuario", uid, "alterado", ",".join(k for k in campos if k != "senha_hash"))
    return _publico(con.execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone())


# ---------- clientes ----------
class ClienteIn(BaseModel):
    tipo_pessoa: Literal["PF", "PJ"] = "PF"
    nome: str = Field(min_length=2)
    documento: str | None = None
    email: str | None = None
    telefone: str | None = None
    endereco: str | None = None
    observacoes: str | None = None


class ClientePatch(BaseModel):
    nome: str | None = Field(default=None, min_length=2)
    documento: str | None = None
    email: str | None = None
    telefone: str | None = None
    endereco: str | None = None
    observacoes: str | None = None
    ativo: bool | None = None


def _checar_documento(tipo: str | None, documento: str | None) -> tuple[str | None, str]:
    if not documento or not documento.strip():
        return None, ""
    dig = so_digitos(documento)
    if not documento_valido(dig):
        raise HTTPException(422, "CPF/CNPJ inválido (dígitos verificadores não conferem).")
    if tipo == "PF" and len(dig) != 11:
        raise HTTPException(422, "Pessoa física precisa de CPF (11 dígitos).")
    if tipo == "PJ" and len(dig) != 14:
        raise HTTPException(422, "Pessoa jurídica precisa de CNPJ (14 dígitos).")
    return formatar_documento(dig), dig


def _cliente_dict(c: sqlite3.Row) -> dict:
    return {k: c[k] for k in c.keys() if k != "documento_digitos"} | {"ativo": bool(c["ativo"])}


@router.get("/clientes")
def listar_clientes(q: str = "", limite: int = 100, offset: int = 0, _u: sqlite3.Row = Depends(usuario_atual),
                    con: sqlite3.Connection = Depends(get_db)):
    dig = so_digitos(q)
    cond, args = ["ativo=1"], []
    if q.strip():
        partes = ["norm(nome) LIKE '%'||norm(?)||'%'", "norm(coalesce(email,'')) LIKE '%'||norm(?)||'%'"]
        args += [q, q]
        if len(dig) >= 3:
            partes.append("documento_digitos LIKE '%'||?||'%'")
            args.append(dig)
        cond.append("(" + " OR ".join(partes) + ")")
    linhas = con.execute(f"SELECT * FROM clientes WHERE {' AND '.join(cond)} ORDER BY nome LIMIT ? OFFSET ?",
                         (*args, min(limite, 500), offset)).fetchall()
    return [_cliente_dict(c) for c in linhas]


@router.post("/clientes", status_code=201)
def criar_cliente(d: ClienteIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    doc, dig = _checar_documento(d.tipo_pessoa, d.documento)
    if dig and (dup := con.execute("SELECT id,nome FROM clientes WHERE documento_digitos=?", (dig,)).fetchone()):
        raise HTTPException(409, f"Já existe cliente com este documento: {dup['nome']} (id {dup['id']}).")
    cur = con.execute("INSERT INTO clientes(tipo_pessoa,nome,documento,documento_digitos,email,telefone,endereco,observacoes,criado_em) VALUES(?,?,?,?,?,?,?,?,?)",
                      (d.tipo_pessoa, d.nome.strip(), doc, dig, d.email, d.telefone, d.endereco, d.observacoes, relogio.agora_iso()))
    auditoria.registrar(con, u["id"], "cliente", cur.lastrowid, "criado")
    return _cliente_dict(con.execute("SELECT * FROM clientes WHERE id=?", (cur.lastrowid,)).fetchone())


@router.get("/clientes/{cid}")
def ver_cliente(cid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    c = con.execute("SELECT * FROM clientes WHERE id=?", (cid,)).fetchone()
    if not c:
        raise HTTPException(404, "Cliente não encontrado.")
    procs = con.execute(
        """SELECT p.id,p.numero,p.tipo,p.fase,p.status,p.assunto FROM processos p
           WHERE p.cliente_id=? AND (?='admin' OR p.restrito=0 OR EXISTS(
             SELECT 1 FROM processo_responsaveis r WHERE r.processo_id=p.id AND r.usuario_id=?))
           ORDER BY p.id DESC""", (cid, u["papel"], u["id"])).fetchall()
    return _cliente_dict(c) | {"processos": [dict(p) for p in procs]}


@router.patch("/clientes/{cid}")
def alterar_cliente(cid: int, d: ClientePatch, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)),
                    con: sqlite3.Connection = Depends(get_db)):
    c = con.execute("SELECT * FROM clientes WHERE id=?", (cid,)).fetchone()
    if not c:
        raise HTTPException(404, "Cliente não encontrado.")
    campos = d.model_dump(exclude_unset=True)
    if "documento" in campos:
        doc, dig = _checar_documento(c["tipo_pessoa"], campos["documento"])
        if dig and (dup := con.execute("SELECT id FROM clientes WHERE documento_digitos=? AND id!=?", (dig, cid)).fetchone()):
            raise HTTPException(409, f"Documento já cadastrado no cliente {dup['id']}.")
        campos["documento"], campos["documento_digitos"] = doc, dig
    if "ativo" in campos:
        campos["ativo"] = int(campos["ativo"])
    if campos:
        con.execute(f"UPDATE clientes SET {','.join(f'{k}=?' for k in campos)} WHERE id=?", (*campos.values(), cid))
        auditoria.registrar(con, u["id"], "cliente", cid, "alterado", ",".join(campos))
    return _cliente_dict(con.execute("SELECT * FROM clientes WHERE id=?", (cid,)).fetchone())


# ---------- feriados locais ----------
class FeriadoIn(BaseModel):
    data: date
    nome: str = Field(min_length=2)
    escopo: Literal["estadual", "municipal", "forense"] = "forense"
    tribunal: str = ""


@router.get("/feriados")
def listar_feriados(_u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    return [dict(f) for f in con.execute("SELECT * FROM feriados ORDER BY data").fetchall()]


@router.post("/feriados", status_code=201)
def criar_feriado(d: FeriadoIn, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    try:
        cur = con.execute("INSERT INTO feriados(data,nome,escopo,tribunal) VALUES(?,?,?,?)",
                          (d.data.isoformat(), d.nome, d.escopo, d.tribunal.strip().upper()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Este feriado já está cadastrado para este tribunal.")
    auditoria.registrar(con, u["id"], "feriado", cur.lastrowid, "criado", d.data.isoformat())
    return dict(con.execute("SELECT * FROM feriados WHERE id=?", (cur.lastrowid,)).fetchone())


@router.delete("/feriados/{fid}")
def apagar_feriado(fid: int, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("DELETE FROM feriados WHERE id=?", (fid,)).rowcount:
        raise HTTPException(404, "Feriado não encontrado.")
    auditoria.registrar(con, u["id"], "feriado", fid, "removido")
    return {"ok": True}


def feriados_extras(con: sqlite3.Connection, tribunal_sigla: str | None) -> frozenset[date]:
    """Feriados locais que valem para um tribunal: os sem tribunal e os dele."""
    linhas = con.execute("SELECT data FROM feriados WHERE tribunal='' OR tribunal=?", ((tribunal_sigla or "").upper(),)).fetchall()
    return frozenset(date.fromisoformat(r["data"]) for r in linhas)
