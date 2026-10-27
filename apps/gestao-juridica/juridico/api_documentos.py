"""Documentos: pastas por cliente/processo, upload com versionamento, busca no conteúdo,
controle de acesso, assinatura eletrônica e geração a partir de modelos."""
from __future__ import annotations

import hashlib
import mimetypes
import os
import re
import sqlite3
import tempfile
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import acesso, auditoria, config, modelos, relogio, seguranca, texto
from .deps import EDITORES, exigir_papel, get_db
from .documentos_br import cpf_valido, formatar_documento, so_digitos
from .regras_prazo import normalizar

router = APIRouter(prefix="/api")
PASTAS_CLIENTE = ["Cadastro", "Procurações e Contratos"]
VALIDADE_CONVITE = timedelta(days=7)
MARCA_INI, MARCA_FIM = "\u0001", "\u0002"  # delimitam o trecho achado; o front escapa o texto e só então troca por <mark>


# ---------- armazenamento ----------
def nome_seguro(nome: str) -> str:
    base = os.path.basename((nome or "").replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f<>:\"|?*]", "_", base).strip(" .")
    return base[:200] or "arquivo"


def caminho_arquivo(sha: str) -> Path:
    return config.dir_arquivos() / sha[:2] / sha


def guardar_bytes(dados: bytes) -> tuple[str, int]:
    sha = hashlib.sha256(dados).hexdigest()
    destino = caminho_arquivo(sha)
    if not destino.exists():
        destino.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=destino.parent)
        with os.fdopen(fd, "wb") as f:
            f.write(dados)
        os.replace(tmp, destino)
    return sha, len(dados)


def guardar_upload(arquivo: UploadFile) -> tuple[str, int]:
    """Grava em streaming, recusando acima do limite; o nome no disco é o hash (sem path traversal)."""
    ext = Path(nome_seguro(arquivo.filename or "")).suffix.lower()
    if ext not in config.EXTENSOES_PERMITIDAS:
        raise HTTPException(415, f"Tipo de arquivo não permitido ({ext or 'sem extensão'}).")
    h, total = hashlib.sha256(), 0
    fd, tmp = tempfile.mkstemp(dir=config.dir_arquivos())
    try:
        with os.fdopen(fd, "wb") as f:
            while bloco := arquivo.file.read(1024 * 1024):
                total += len(bloco)
                if total > config.LIMITE_UPLOAD:
                    raise HTTPException(413, f"Arquivo maior que {config.LIMITE_UPLOAD // (1024 * 1024)} MB.")
                h.update(bloco)
                f.write(bloco)
        if total == 0:
            raise HTTPException(422, "Arquivo vazio.")
        sha = h.hexdigest()
        destino = caminho_arquivo(sha)
        destino.parent.mkdir(parents=True, exist_ok=True)
        os.replace(tmp, destino)
        return sha, total
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


# ---------- acesso ----------
def _pasta(con: sqlite3.Connection, u: sqlite3.Row, pasta_id: int) -> sqlite3.Row:
    p = con.execute("SELECT * FROM pastas WHERE id=?", (pasta_id,)).fetchone()
    if not p or (p["processo_id"] and not acesso.pode_ver(con, u, p["processo_id"])):
        raise HTTPException(404, "Pasta não encontrada.")
    return p


def _documento(con: sqlite3.Connection, u: sqlite3.Row, did: int, incluir_excluido: bool = False) -> sqlite3.Row:
    d = con.execute("SELECT * FROM documentos WHERE id=?", (did,)).fetchone()
    if not d or (d["excluido_em"] and not incluir_excluido):
        raise HTTPException(404, "Documento não encontrado.")
    _pasta(con, u, d["pasta_id"])
    return d


def _versao(con: sqlite3.Connection, u: sqlite3.Row, vid: int) -> sqlite3.Row:
    v = con.execute("SELECT * FROM documento_versoes WHERE id=?", (vid,)).fetchone()
    if not v:
        raise HTTPException(404, "Versão não encontrada.")
    _documento(con, u, v["documento_id"])
    return v


# ---------- índice de busca ----------
def indexar(con: sqlite3.Connection, documento_id: int, versao_id: int, nome: str, conteudo: str) -> None:
    con.execute("DELETE FROM busca_documentos WHERE documento_id=?", (documento_id,))
    con.execute("INSERT INTO busca_documentos(nome,texto,documento_id,versao_id) VALUES(?,?,?,?)", (nome, conteudo, documento_id, versao_id))


def nova_versao(con: sqlite3.Connection, u: sqlite3.Row | None, documento_id: int, nome: str, sha: str, tamanho: int,
                comentario: str | None) -> int:
    numero = con.execute("SELECT COALESCE(MAX(numero),0)+1 FROM documento_versoes WHERE documento_id=?", (documento_id,)).fetchone()[0]
    conteudo, ocr = texto.extrair(caminho_arquivo(sha), nome)
    mime = mimetypes.guess_type(nome)[0] or "application/octet-stream"
    cur = con.execute("""INSERT INTO documento_versoes(documento_id,numero,sha256,tamanho,mime,arquivo,texto,ocr_status,comentario,enviado_por,enviado_em)
                         VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                      (documento_id, numero, sha, tamanho, mime, sha, conteudo, ocr, comentario, u["id"] if u else None, relogio.agora_iso()))
    con.execute("UPDATE documentos SET versao_atual=?, nome=? WHERE id=?", (numero, nome, documento_id))
    indexar(con, documento_id, cur.lastrowid, nome, conteudo)
    return cur.lastrowid


def criar_documento(con: sqlite3.Connection, u: sqlite3.Row | None, pasta_id: int, nome: str, sha: str, tamanho: int, comentario: str | None) -> int:
    cur = con.execute("INSERT INTO documentos(pasta_id,nome,criado_por,criado_em) VALUES(?,?,?,?)", (pasta_id, nome, u["id"] if u else None, relogio.agora_iso()))
    nova_versao(con, u, cur.lastrowid, nome, sha, tamanho, comentario)
    auditoria.registrar(con, u["id"] if u else None, "documento", cur.lastrowid, "criado", nome)
    return cur.lastrowid


def _doc_dict(con: sqlite3.Connection, d: sqlite3.Row) -> dict:
    v = con.execute("SELECT * FROM documento_versoes WHERE documento_id=? AND numero=?", (d["id"], d["versao_atual"])).fetchone()
    n_ass = con.execute("SELECT COUNT(*) FROM assinaturas WHERE versao_id=?", (v["id"],)).fetchone()[0]
    return {"id": d["id"], "pasta_id": d["pasta_id"], "nome": d["nome"], "versao_atual": d["versao_atual"], "criado_em": d["criado_em"],
            "excluido": bool(d["excluido_em"]), "versao_id": v["id"], "tamanho": v["tamanho"], "mime": v["mime"], "ocr_status": v["ocr_status"],
            "enviado_em": v["enviado_em"], "assinaturas": n_ass}


# ---------- pastas ----------
def garantir_pastas_cliente(con: sqlite3.Connection, cid: int) -> None:
    for i, nome in enumerate(PASTAS_CLIENTE):
        con.execute("INSERT OR IGNORE INTO pastas(cliente_id,nome,ordem) VALUES(?,?,?)", (cid, nome, i))


def _arvore(con: sqlite3.Connection, filtro: str, valor: int) -> list[dict]:
    saida = []
    for p in con.execute(f"SELECT * FROM pastas WHERE {filtro}=? ORDER BY ordem,nome", (valor,)).fetchall():
        docs = con.execute("SELECT * FROM documentos WHERE pasta_id=? AND excluido_em IS NULL ORDER BY nome", (p["id"],)).fetchall()
        saida.append({"id": p["id"], "nome": p["nome"], "documentos": [_doc_dict(con, d) for d in docs]})
    return saida


@router.get("/processos/{pid}/pastas")
def pastas_do_processo(pid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    return _arvore(con, "processo_id", pid)


@router.get("/clientes/{cid}/pastas")
def pastas_do_cliente(cid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("SELECT 1 FROM clientes WHERE id=?", (cid,)).fetchone():
        raise HTTPException(404, "Cliente não encontrado.")
    garantir_pastas_cliente(con, cid)
    return _arvore(con, "cliente_id", cid)


class PastaIn(BaseModel):
    nome: str = Field(min_length=2, max_length=80)


@router.post("/processos/{pid}/pastas", status_code=201)
def criar_pasta_processo(pid: int, d: PastaIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    try:
        cur = con.execute("INSERT INTO pastas(processo_id,nome,ordem) VALUES(?,?,99)", (pid, d.nome.strip()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Já existe uma pasta com este nome.")
    return {"id": cur.lastrowid, "nome": d.nome.strip(), "documentos": []}


# ---------- upload, versões, download ----------
@router.post("/pastas/{pasta_id}/documentos", status_code=201)
def enviar_documento(pasta_id: int, arquivo: UploadFile = File(...), nome: str = Form(""), comentario: str = Form(""),
                     u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    _pasta(con, u, pasta_id)
    nome_final = nome_seguro(nome or arquivo.filename or "")
    sha, tam = guardar_upload(arquivo)
    did = criar_documento(con, u, pasta_id, nome_final, sha, tam, comentario or None)
    return _doc_dict(con, con.execute("SELECT * FROM documentos WHERE id=?", (did,)).fetchone())


@router.post("/documentos/{did}/versoes", status_code=201)
def enviar_versao(did: int, arquivo: UploadFile = File(...), comentario: str = Form(""),
                  u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    d = _documento(con, u, did)
    atual = con.execute("SELECT sha256 FROM documento_versoes WHERE documento_id=? AND numero=?", (did, d["versao_atual"])).fetchone()
    sha, tam = guardar_upload(arquivo)
    if sha == atual["sha256"]:
        raise HTTPException(409, "O arquivo enviado é idêntico à versão atual.")
    nome = nome_seguro(arquivo.filename or d["nome"])
    nova_versao(con, u, did, nome, sha, tam, comentario or None)
    auditoria.registrar(con, u["id"], "documento", did, "nova_versao", nome)
    return _doc_dict(con, con.execute("SELECT * FROM documentos WHERE id=?", (did,)).fetchone())


@router.get("/documentos/busca")
def buscar(q: str, processo_id: int = 0, cliente_id: int = 0, limite: int = 30, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)),
           con: sqlite3.Connection = Depends(get_db)):
    termos = re.findall(r"\w+", normalizar(q))
    if not termos:
        raise HTTPException(422, "Digite ao menos uma palavra para buscar.")
    fts = " AND ".join(f'"{t}"*' for t in termos[:8])
    cond, args = ["busca_documentos MATCH :fts", "d.excluido_em IS NULL", "(pa.processo_id IS NULL OR " + acesso.visivel("pr") + ")"], \
                 {"fts": fts, "papel": u["papel"], "uid": u["id"], "lim": min(limite, 100)}
    if processo_id:
        cond.append("pa.processo_id=:proc")
        args["proc"] = processo_id
    if cliente_id:
        cond.append("coalesce(pa.cliente_id,pr.cliente_id)=:cli")
        args["cli"] = cliente_id
    linhas = con.execute(f"""SELECT d.id, d.nome, pa.nome AS pasta, pr.numero AS processo_numero, pa.processo_id,
                             snippet(busca_documentos,1,'{MARCA_INI}','{MARCA_FIM}','…',14) AS trecho, bm25(busca_documentos) AS rank
                             FROM busca_documentos JOIN documentos d ON d.id=busca_documentos.documento_id
                             JOIN pastas pa ON pa.id=d.pasta_id LEFT JOIN processos pr ON pr.id=pa.processo_id
                             WHERE {' AND '.join(cond)} ORDER BY rank LIMIT :lim""", args).fetchall()
    return [{k: r[k] for k in r.keys() if k != "rank"} for r in linhas]


@router.get("/documentos/{did}")
def ver_documento(did: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    d = _documento(con, u, did)
    versoes = []
    for v in con.execute("""SELECT v.*, us.nome AS enviado_por_nome FROM documento_versoes v LEFT JOIN usuarios us ON us.id=v.enviado_por
                            WHERE v.documento_id=? ORDER BY v.numero DESC""", (did,)):
        ass = [dict(a) for a in con.execute("SELECT nome,metodo,assinado_em FROM assinaturas WHERE versao_id=? ORDER BY id", (v["id"],))]
        versoes.append({"id": v["id"], "numero": v["numero"], "tamanho": v["tamanho"], "sha256": v["sha256"], "enviado_em": v["enviado_em"],
                        "enviado_por": v["enviado_por_nome"], "comentario": v["comentario"], "ocr_status": v["ocr_status"], "assinaturas": ass})
    hist = [dict(h) for h in con.execute("""SELECT a.em,a.acao,a.detalhes,coalesce(u.nome,'Sistema') AS usuario FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
                                            WHERE a.entidade='documento' AND a.entidade_id=? ORDER BY a.id DESC""", (did,))]
    return _doc_dict(con, d) | {"versoes": versoes, "historico": hist}


@router.get("/documentos/versoes/{vid}/arquivo")
def baixar(vid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    v = _versao(con, u, vid)
    d = con.execute("SELECT nome FROM documentos WHERE id=?", (v["documento_id"],)).fetchone()
    arq = caminho_arquivo(v["sha256"])
    if not arq.exists():
        raise HTTPException(410, "O arquivo desta versão não está mais no armazenamento.")
    auditoria.registrar(con, u["id"], "documento", v["documento_id"], "download", f"v{v['numero']}")
    # Sempre como anexo e com nosniff: um HTML enviado como "documento" nunca executa no domínio do sistema.
    return FileResponse(arq, media_type=v["mime"] or "application/octet-stream", filename=d["nome"],
                        headers={"X-Content-Type-Options": "nosniff"}, content_disposition_type="attachment")


@router.delete("/documentos/{did}")
def excluir(did: int, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    _documento(con, u, did)
    con.execute("UPDATE documentos SET excluido_em=? WHERE id=?", (relogio.agora_iso(), did))
    con.execute("DELETE FROM busca_documentos WHERE documento_id=?", (did,))
    auditoria.registrar(con, u["id"], "documento", did, "excluido")
    return {"ok": True, "desfazer": f"/api/documentos/{did}/restaurar"}


@router.post("/documentos/{did}/restaurar")
def restaurar(did: int, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    d = _documento(con, u, did, incluir_excluido=True)
    con.execute("UPDATE documentos SET excluido_em=NULL WHERE id=?", (did,))
    v = con.execute("SELECT id,texto FROM documento_versoes WHERE documento_id=? AND numero=?", (did, d["versao_atual"])).fetchone()
    indexar(con, did, v["id"], d["nome"], v["texto"])
    auditoria.registrar(con, u["id"], "documento", did, "restaurado")
    return _doc_dict(con, con.execute("SELECT * FROM documentos WHERE id=?", (did,)).fetchone())


# ---------- assinatura eletrônica ----------
# Assinatura eletrônica simples/avançada (Lei 14.063/2020): amarra arquivo + pessoa + instante com selo HMAC
# verificável. NÃO é assinatura qualificada ICP-Brasil; para ato que a exija, use certificado A1/A3 externo.
def _registrar_assinatura(con: sqlite3.Connection, v: sqlite3.Row, nome: str, cpf: str | None, email: str | None,
                          usuario_id: int | None, metodo: str, ip: str | None) -> int:
    quando = relogio.agora_iso()
    cur = con.execute("INSERT INTO assinaturas(versao_id,nome,documento_cpf,email,usuario_id,metodo,sha256,assinado_em,ip,selo) VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (v["id"], nome, cpf, email, usuario_id, metodo, v["sha256"], quando, ip,
                       seguranca.selo(v["sha256"], nome, cpf or "", quando, v["id"])))
    auditoria.registrar(con, usuario_id, "documento", v["documento_id"], "assinado", f"v{v['numero']} {nome}")
    return cur.lastrowid


class AssinarIn(BaseModel):
    senha: str


@router.post("/documentos/versoes/{vid}/assinar", status_code=201)
def assinar(vid: int, d: AssinarIn, request: Request, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")),
            con: sqlite3.Connection = Depends(get_db)):
    v = _versao(con, u, vid)
    if not seguranca.conferir_senha(d.senha, u["senha_hash"]):
        raise HTTPException(401, "Senha incorreta: a assinatura exige confirmar a senha.")
    if con.execute("SELECT 1 FROM assinaturas WHERE versao_id=? AND usuario_id=?", (vid, u["id"])).fetchone():
        raise HTTPException(409, "Você já assinou esta versão.")
    aid = _registrar_assinatura(con, v, u["nome"], None, u["email"], u["id"], "login", request.client.host if request.client else None)
    return {"assinatura_id": aid}


class ConviteIn(BaseModel):
    nome: str = Field(min_length=2)
    email: str | None = None


@router.post("/documentos/versoes/{vid}/solicitar-assinatura", status_code=201)
def solicitar(vid: int, d: ConviteIn, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    v = _versao(con, u, vid)
    token, h = seguranca.novo_token()
    expira = (relogio.agora() + VALIDADE_CONVITE).isoformat(timespec="seconds")
    con.execute("INSERT INTO solicitacoes_assinatura(versao_id,nome,email,token_hash,expira_em,criado_por,criado_em) VALUES(?,?,?,?,?,?,?)",
                (vid, d.nome.strip(), d.email, h, expira, u["id"], relogio.agora_iso()))
    auditoria.registrar(con, u["id"], "documento", v["documento_id"], "assinatura_solicitada", d.nome)
    # O token só existe aqui, em claro, uma vez: o banco guarda apenas o hash.
    return {"token": token, "caminho": f"/assinar.html#{token}", "expira_em": expira}


def _convite(con: sqlite3.Connection, token: str) -> sqlite3.Row:
    s = con.execute("SELECT * FROM solicitacoes_assinatura WHERE token_hash=?", (seguranca.hash_token(token),)).fetchone()
    if not s or s["expira_em"] < relogio.agora_iso():
        raise HTTPException(404, "Link de assinatura inválido ou expirado.")
    if s["usada_em"]:
        raise HTTPException(410, "Este link de assinatura já foi usado.")
    return s


@router.get("/publico/assinatura/{token}")
def ver_convite(token: str, con: sqlite3.Connection = Depends(get_db)):
    s = _convite(con, token)
    v = con.execute("SELECT v.*, d.nome AS doc_nome FROM documento_versoes v JOIN documentos d ON d.id=v.documento_id WHERE v.id=?", (s["versao_id"],)).fetchone()
    return {"documento": v["doc_nome"], "signatario": s["nome"], "sha256": v["sha256"], "expira_em": s["expira_em"]}


@router.get("/publico/assinatura/{token}/arquivo")
def convite_arquivo(token: str, con: sqlite3.Connection = Depends(get_db)):
    s = _convite(con, token)
    v = con.execute("SELECT v.*, d.nome AS doc_nome FROM documento_versoes v JOIN documentos d ON d.id=v.documento_id WHERE v.id=?", (s["versao_id"],)).fetchone()
    return FileResponse(caminho_arquivo(v["sha256"]), media_type=v["mime"] or "application/octet-stream", filename=v["doc_nome"],
                        headers={"X-Content-Type-Options": "nosniff"}, content_disposition_type="attachment")


class AssinaturaPublicaIn(BaseModel):
    nome: str = Field(min_length=2)
    cpf: str
    aceite: bool


@router.post("/publico/assinatura/{token}", status_code=201)
def assinar_por_link(token: str, d: AssinaturaPublicaIn, request: Request, con: sqlite3.Connection = Depends(get_db)):
    s = _convite(con, token)
    if not d.aceite:
        raise HTTPException(422, "É preciso aceitar os termos para assinar.")
    if not cpf_valido(d.cpf):
        raise HTTPException(422, "CPF inválido.")
    v = con.execute("SELECT * FROM documento_versoes WHERE id=?", (s["versao_id"],)).fetchone()
    aid = _registrar_assinatura(con, v, d.nome.strip(), formatar_documento(so_digitos(d.cpf)), s["email"], None, "link",
                                request.client.host if request.client else None)
    con.execute("UPDATE solicitacoes_assinatura SET usada_em=? WHERE id=?", (relogio.agora_iso(), s["id"]))
    return {"assinatura_id": aid, "sha256": v["sha256"]}


@router.get("/documentos/versoes/{vid}/verificar")
def verificar(vid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    """Recalcula o hash do arquivo guardado e confere cada selo. Arquivo trocado ou registro mexido = inválido."""
    v = _versao(con, u, vid)
    arq = caminho_arquivo(v["sha256"])
    integro = arq.exists() and hashlib.sha256(arq.read_bytes()).hexdigest() == v["sha256"]
    ass = []
    for a in con.execute("SELECT * FROM assinaturas WHERE versao_id=? ORDER BY id", (vid,)):
        selo_ok = a["sha256"] == v["sha256"] and seguranca.selo(a["sha256"], a["nome"], a["documento_cpf"] or "", a["assinado_em"], vid) == a["selo"]
        ass.append({"nome": a["nome"], "metodo": a["metodo"], "assinado_em": a["assinado_em"], "valida": bool(selo_ok and integro)})
    return {"integro": integro, "sha256": v["sha256"], "assinaturas": ass}


# ---------- modelos ----------
class ModeloIn(BaseModel):
    nome: str = Field(min_length=3)
    categoria: str | None = None
    corpo: str = Field(min_length=10)


@router.get("/modelos")
def listar_modelos(u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    return [{"id": m["id"], "nome": m["nome"], "categoria": m["categoria"], "corpo": m["corpo"], "variaveis": modelos.variaveis_do_modelo(m["corpo"])}
            for m in con.execute("SELECT * FROM modelos ORDER BY categoria,nome")]


@router.get("/modelos/variaveis")
def variaveis_disponiveis(_u: sqlite3.Row = Depends(exigir_papel(*EDITORES))):
    return modelos.VARIAVEIS


def _validar_modelo(corpo: str) -> None:
    desconhecidas = [v for v in modelos.variaveis_do_modelo(corpo) if v not in modelos.VARIAVEIS]
    if desconhecidas:
        raise HTTPException(422, "Variáveis desconhecidas no modelo: " + ", ".join(desconhecidas))


@router.post("/modelos", status_code=201)
def criar_modelo(d: ModeloIn, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    _validar_modelo(d.corpo)
    agora = relogio.agora_iso()
    try:
        cur = con.execute("INSERT INTO modelos(nome,categoria,corpo,criado_em,atualizado_em) VALUES(?,?,?,?,?)", (d.nome.strip(), d.categoria, d.corpo, agora, agora))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Já existe um modelo com este nome.")
    auditoria.registrar(con, u["id"], "modelo", cur.lastrowid, "criado")
    return {"id": cur.lastrowid}


@router.put("/modelos/{mid}")
def alterar_modelo(mid: int, d: ModeloIn, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    _validar_modelo(d.corpo)
    if not con.execute("UPDATE modelos SET nome=?,categoria=?,corpo=?,atualizado_em=? WHERE id=?", (d.nome.strip(), d.categoria, d.corpo, relogio.agora_iso(), mid)).rowcount:
        raise HTTPException(404, "Modelo não encontrado.")
    auditoria.registrar(con, u["id"], "modelo", mid, "alterado")
    return {"ok": True}


class GerarIn(BaseModel):
    processo_id: int | None = None
    cliente_id: int | None = None
    pasta_id: int | None = None
    extras: dict[str, str] = {}
    apenas_previa: bool = False


@router.post("/modelos/{mid}/gerar")
def gerar(mid: int, d: GerarIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    m = con.execute("SELECT * FROM modelos WHERE id=?", (mid,)).fetchone()
    if not m:
        raise HTTPException(404, "Modelo não encontrado.")
    if d.processo_id:
        acesso.carregar_processo(con, u, d.processo_id)
    ctx = modelos.contexto(con, u, d.processo_id, d.cliente_id, d.extras)
    try:
        corpo = modelos.renderizar(m["corpo"], ctx)
    except modelos.VariaveisFaltando as e:
        raise HTTPException(422, {"mensagem": "Faltam dados para gerar o documento.", "faltando": e.faltando})
    if d.apenas_previa or not d.pasta_id:
        return {"texto": corpo}
    _pasta(con, u, d.pasta_id)
    nome = nome_seguro(f"{m['nome']}.docx")
    sha, tam = guardar_bytes(modelos.gerar_docx(corpo))
    did = criar_documento(con, u, d.pasta_id, nome, sha, tam, f"Gerado do modelo “{m['nome']}”")
    return {"texto": corpo, "documento": _doc_dict(con, con.execute("SELECT * FROM documentos WHERE id=?", (did,)).fetchone())}


# ---------- histórico ----------
@router.get("/auditoria")
def historico(entidade: str, entidade_id: int, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")), con: sqlite3.Connection = Depends(get_db)):
    if entidade == "processo":
        acesso.carregar_processo(con, u, entidade_id)
    elif u["papel"] != "admin":
        raise HTTPException(403, "Somente o administrador consulta a auditoria desta entidade.")
    return [dict(r) for r in con.execute("""SELECT a.em,a.acao,a.detalhes,coalesce(us.nome,'Sistema') AS usuario FROM auditoria a LEFT JOIN usuarios us ON us.id=a.usuario_id
                                            WHERE a.entidade=? AND a.entidade_id=? ORDER BY a.id DESC LIMIT 200""", (entidade, entidade_id))]
