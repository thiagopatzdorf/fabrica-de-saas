"""Processos: cadastro, partes, responsáveis, fases, andamentos e vínculos."""
from __future__ import annotations

import hashlib
import sqlite3
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import acesso, auditoria, cnj, datajud, relogio
from .deps import EDITORES, exigir_papel, get_db, usuario_atual
from .documentos_br import documento_valido, formatar_documento, so_digitos
from .regras_prazo import normalizar

router = APIRouter(prefix="/api")

FASES = {
    "judicial": ["Conhecimento", "Instrução", "Sentença", "Recursal", "Cumprimento/Execução", "Arquivado"],
    "administrativo": ["Protocolo", "Análise", "Decisão", "Recurso administrativo", "Encerrado"],
    "extrajudicial": ["Negociação", "Notificação", "Acordo", "Encerrado"],
}
PASTAS_PADRAO = ["Petição Inicial", "Documentos", "Provas", "Decisões", "Recursos"]
Polo = Literal["ativo", "passivo", "terceiro"]


class ProcessoIn(BaseModel):
    cliente_id: int
    tipo: Literal["judicial", "administrativo", "extrajudicial"] = "judicial"
    numero: str | None = None
    numero_legado: bool = False
    tribunal: str | None = None
    uf: str | None = None
    vara: str | None = None
    comarca: str | None = None
    classe: str | None = None
    assunto: str | None = None
    polo_cliente: Polo = "ativo"
    fase: str | None = None
    status: Literal["ativo", "suspenso", "arquivado", "encerrado"] = "ativo"
    valor_causa_centavos: int | None = Field(default=None, ge=0)
    data_distribuicao: date | None = None
    restrito: bool = False
    observacoes: str | None = None
    responsaveis: list[int] = []


class ProcessoPatch(BaseModel):
    tribunal: str | None = None
    vara: str | None = None
    comarca: str | None = None
    classe: str | None = None
    assunto: str | None = None
    polo_cliente: Polo | None = None
    fase: str | None = None
    status: Literal["ativo", "suspenso", "arquivado", "encerrado"] | None = None
    valor_causa_centavos: int | None = Field(default=None, ge=0)
    data_distribuicao: date | None = None
    restrito: bool | None = None
    observacoes: str | None = None


def _resolver_numero(d: ProcessoIn) -> dict:
    """Valida o número conforme o tipo e deduz tribunal/UF quando é CNJ."""
    numero = (d.numero or "").strip()
    if d.tipo == "judicial" and not numero:
        raise HTTPException(422, "Processo judicial precisa do número.")
    if not numero:
        return {"numero": None, "numero_digitos": "", "numero_legado": 0}
    if d.tipo != "judicial" or d.numero_legado:
        return {"numero": numero, "numero_digitos": "", "numero_legado": int(d.tipo == "judicial")}
    n = cnj.interpretar(numero)
    if not n:
        raise HTTPException(422, "Número CNJ inválido: confira os dígitos (o dígito verificador não fecha). "
                                 "Para numeração antiga, marque numero_legado.")
    return {"numero": n.formatado, "numero_digitos": n.digitos, "numero_legado": 0,
            "tribunal": n.sigla, "tribunal_codigo": n.codigo_tribunal, "uf": n.uf}


def _validar_fase(tipo: str, fase: str) -> None:
    if fase not in FASES[tipo]:
        raise HTTPException(422, f"Fase inválida para processo {tipo}. Use: {', '.join(FASES[tipo])}.")


def _checar_usuarios(con: sqlite3.Connection, ids: list[int]) -> None:
    for i in ids:
        if not con.execute("SELECT 1 FROM usuarios WHERE id=? AND ativo=1", (i,)).fetchone():
            raise HTTPException(422, f"Responsável {i} não existe ou está inativo.")


def _resumo(con: sqlite3.Connection, p: sqlite3.Row) -> dict:
    cli = con.execute("SELECT nome FROM clientes WHERE id=?", (p["cliente_id"],)).fetchone()
    resp = con.execute("SELECT u.id,u.nome,r.papel FROM processo_responsaveis r JOIN usuarios u ON u.id=r.usuario_id "
                       "WHERE r.processo_id=? ORDER BY r.papel,u.nome", (p["id"],)).fetchall()
    prazo = con.execute("SELECT MIN(data_fatal) AS d FROM prazos WHERE processo_id=? AND status IN('pendente','em_andamento','em_revisao')",
                        (p["id"],)).fetchone()
    d = {k: p[k] for k in p.keys() if k != "numero_digitos"}
    d["restrito"], d["numero_legado"] = bool(p["restrito"]), bool(p["numero_legado"])
    return d | {"cliente_nome": cli["nome"] if cli else None, "responsaveis": [dict(r) for r in resp], "proximo_prazo": prazo["d"]}


@router.get("/processos/fases")
def listar_fases(_u: sqlite3.Row = Depends(usuario_atual)):
    return FASES


@router.get("/processos")
def listar_processos(q: str = "", status: str = "", tipo: str = "", fase: str = "", cliente_id: int = 0,
                     responsavel_id: int = 0, limite: int = 100, offset: int = 0,
                     u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    cond, args = [acesso.visivel()], {"papel": u["papel"], "uid": u["id"], "lim": min(limite, 500), "off": offset}
    if q.strip():
        dig = so_digitos(q)
        alvos = ["norm(c.nome) LIKE '%'||norm(:q)||'%'", "norm(coalesce(p.assunto,'')) LIKE '%'||norm(:q)||'%'",
                 "norm(coalesce(p.classe,'')) LIKE '%'||norm(:q)||'%'", "norm(coalesce(p.vara,'')) LIKE '%'||norm(:q)||'%'",
                 "coalesce(p.numero,'') LIKE '%'||:q||'%'",
                 "EXISTS(SELECT 1 FROM partes pt WHERE pt.processo_id=p.id AND norm(pt.nome) LIKE '%'||norm(:q)||'%')"]
        args["q"] = q.strip()
        if len(dig) >= 3:
            args["dig"] = dig
            alvos += ["c.documento_digitos LIKE '%'||:dig||'%'", "p.numero_digitos LIKE '%'||:dig||'%'",
                      "EXISTS(SELECT 1 FROM partes pt WHERE pt.processo_id=p.id AND pt.documento_digitos LIKE '%'||:dig||'%')"]
        cond.append("(" + " OR ".join(alvos) + ")")
    for campo, valor in (("p.status", status), ("p.tipo", tipo), ("p.fase", fase)):
        if valor:
            cond.append(f"{campo}=:{campo[2:]}")
            args[campo[2:]] = valor
    if cliente_id:
        cond.append("p.cliente_id=:cliente_id")
        args["cliente_id"] = cliente_id
    if responsavel_id:
        cond.append("EXISTS(SELECT 1 FROM processo_responsaveis r WHERE r.processo_id=p.id AND r.usuario_id=:resp)")
        args["resp"] = responsavel_id
    linhas = con.execute(f"SELECT p.* FROM processos p JOIN clientes c ON c.id=p.cliente_id WHERE {' AND '.join(cond)} "
                         "ORDER BY p.atualizado_em DESC, p.id DESC LIMIT :lim OFFSET :off", args).fetchall()
    return [_resumo(con, p) for p in linhas]


@router.post("/processos", status_code=201)
def criar_processo(d: ProcessoIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    if not con.execute("SELECT 1 FROM clientes WHERE id=? AND ativo=1", (d.cliente_id,)).fetchone():
        raise HTTPException(422, "Cliente não encontrado ou inativo.")
    num = _resolver_numero(d)
    fase = d.fase or FASES[d.tipo][0]
    _validar_fase(d.tipo, fase)
    resp = list(dict.fromkeys(d.responsaveis)) or ([u["id"]] if u["papel"] in {"admin", "advogado"} else [])
    _checar_usuarios(con, resp)
    if num["numero_digitos"] and (dup := con.execute("SELECT id FROM processos WHERE numero_digitos=?", (num["numero_digitos"],)).fetchone()):
        raise HTTPException(409, f"Este número já está cadastrado (processo {dup['id']}).")
    agora = relogio.agora_iso()
    tribunal = d.tribunal or num.get("tribunal")
    cur = con.execute(
        """INSERT INTO processos(cliente_id,tipo,numero,numero_digitos,numero_legado,tribunal,tribunal_codigo,uf,vara,comarca,classe,assunto,
           polo_cliente,fase,status,valor_causa_centavos,data_distribuicao,restrito,observacoes,criado_por,criado_em,atualizado_em)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d.cliente_id, d.tipo, num["numero"], num["numero_digitos"], num["numero_legado"], tribunal, num.get("tribunal_codigo"),
         d.uf or num.get("uf"), d.vara, d.comarca, d.classe, d.assunto, d.polo_cliente, fase, d.status, d.valor_causa_centavos,
         d.data_distribuicao.isoformat() if d.data_distribuicao else None, int(d.restrito), d.observacoes, u["id"], agora, agora))
    pid = cur.lastrowid
    for i, uid in enumerate(resp):
        con.execute("INSERT INTO processo_responsaveis VALUES(?,?,?)", (pid, uid, "responsavel" if i == 0 else "colaborador"))
    con.execute("INSERT INTO fases_historico(processo_id,fase,desde,por_usuario_id) VALUES(?,?,?,?)", (pid, fase, agora, u["id"]))
    for ordem, nome in enumerate(PASTAS_PADRAO):
        con.execute("INSERT INTO pastas(processo_id,nome,ordem) VALUES(?,?,?)", (pid, nome, ordem))
    auditoria.registrar(con, u["id"], "processo", pid, "criado", d.tipo)
    return detalhe_processo(pid, u, con)


@router.get("/processos/{pid}")
def detalhe_processo(pid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    p = acesso.carregar_processo(con, u, pid)
    partes = [dict(x) for x in con.execute("SELECT id,nome,documento,polo,papel,oab FROM partes WHERE processo_id=? ORDER BY polo,papel,nome", (pid,))]
    fases = [dict(x) for x in con.execute("SELECT fase,desde,por_usuario_id FROM fases_historico WHERE processo_id=? ORDER BY id", (pid,))]
    vinculos = []
    for v in con.execute("SELECT * FROM vinculos WHERE processo_a=? OR processo_b=?", (pid, pid)):
        outro = v["processo_b"] if v["processo_a"] == pid else v["processo_a"]
        o = con.execute("SELECT id,numero,tipo,fase,status FROM processos WHERE id=?", (outro,)).fetchone()
        if o and acesso.pode_ver(con, u, outro):
            vinculos.append({"id": v["id"], "tipo": v["tipo"], "observacao": v["observacao"],
                             "papel_deste": "origem" if v["processo_a"] == pid else "destino", "outro": dict(o)})
    cli = con.execute("SELECT id,nome,documento,tipo_pessoa FROM clientes WHERE id=?", (p["cliente_id"],)).fetchone()
    return _resumo(con, p) | {"cliente": dict(cli), "partes": partes, "fases_historico": fases, "vinculos": vinculos}


@router.patch("/processos/{pid}")
def alterar_processo(pid: int, d: ProcessoPatch, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)),
                     con: sqlite3.Connection = Depends(get_db)):
    p = acesso.carregar_processo(con, u, pid)
    campos = d.model_dump(exclude_unset=True)
    if "fase" in campos and campos["fase"] is not None:
        _validar_fase(p["tipo"], campos["fase"])
    if "restrito" in campos and campos["restrito"] is not None:
        campos["restrito"] = int(campos["restrito"])
    if "data_distribuicao" in campos and campos["data_distribuicao"] is not None:
        campos["data_distribuicao"] = campos["data_distribuicao"].isoformat()
    campos = {k: v for k, v in campos.items() if v is not None}
    if campos:
        agora = relogio.agora_iso()
        con.execute(f"UPDATE processos SET {','.join(f'{k}=?' for k in campos)}, atualizado_em=? WHERE id=?", (*campos.values(), agora, pid))
        if campos.get("fase") and campos["fase"] != p["fase"]:
            con.execute("INSERT INTO fases_historico(processo_id,fase,desde,por_usuario_id) VALUES(?,?,?,?)", (pid, campos["fase"], agora, u["id"]))
        auditoria.registrar(con, u["id"], "processo", pid, "alterado", ",".join(campos))
    return detalhe_processo(pid, u, con)


class ResponsaveisIn(BaseModel):
    responsavel_id: int
    colaboradores: list[int] = []


@router.put("/processos/{pid}/responsaveis")
def definir_responsaveis(pid: int, d: ResponsaveisIn, u: sqlite3.Row = Depends(exigir_papel("admin", "advogado")),
                         con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    ids = list(dict.fromkeys([d.responsavel_id, *d.colaboradores]))
    _checar_usuarios(con, ids)
    con.execute("DELETE FROM processo_responsaveis WHERE processo_id=?", (pid,))
    for i, uid in enumerate(ids):
        con.execute("INSERT INTO processo_responsaveis VALUES(?,?,?)", (pid, uid, "responsavel" if i == 0 else "colaborador"))
    auditoria.registrar(con, u["id"], "processo", pid, "responsaveis", ",".join(map(str, ids)))
    return detalhe_processo(pid, u, con)


# ---------- partes ----------
class ParteIn(BaseModel):
    nome: str = Field(min_length=2)
    documento: str | None = None
    polo: Polo
    papel: Literal["parte", "advogado", "perito", "testemunha", "outro"] = "parte"
    oab: str | None = None


@router.post("/processos/{pid}/partes", status_code=201)
def adicionar_parte(pid: int, d: ParteIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    dig = so_digitos(d.documento)
    if dig and not documento_valido(dig):
        raise HTTPException(422, "CPF/CNPJ da parte inválido.")
    cur = con.execute("INSERT INTO partes(processo_id,nome,documento,documento_digitos,polo,papel,oab) VALUES(?,?,?,?,?,?,?)",
                      (pid, d.nome.strip(), formatar_documento(dig) if dig else None, dig, d.polo, d.papel, d.oab))
    auditoria.registrar(con, u["id"], "processo", pid, "parte_adicionada", d.papel)
    return dict(con.execute("SELECT id,nome,documento,polo,papel,oab FROM partes WHERE id=?", (cur.lastrowid,)).fetchone())


@router.delete("/processos/{pid}/partes/{parte_id}")
def remover_parte(pid: int, parte_id: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    if not con.execute("DELETE FROM partes WHERE id=? AND processo_id=?", (parte_id, pid)).rowcount:
        raise HTTPException(404, "Parte não encontrada.")
    auditoria.registrar(con, u["id"], "processo", pid, "parte_removida", str(parte_id))
    return {"ok": True}


# ---------- andamentos ----------
class MovimentacaoIn(BaseModel):
    data: date
    tipo: str | None = None
    descricao: str = Field(min_length=2)


def hash_movimentacao(data: str, descricao: str) -> str:
    return hashlib.sha256(f"{data}|{normalizar(descricao)}".encode()).hexdigest()


def inserir_movimentacao(con: sqlite3.Connection, pid: int, data: str, tipo: str | None, descricao: str, origem: str) -> bool:
    """False quando o andamento já existia (mesma data e mesmo texto): importar duas vezes não duplica."""
    try:
        con.execute("INSERT INTO movimentacoes(processo_id,data,tipo,descricao,origem,hash,criado_em) VALUES(?,?,?,?,?,?,?)",
                    (pid, data, tipo, descricao.strip(), origem, hash_movimentacao(data, descricao), relogio.agora_iso()))
    except sqlite3.IntegrityError:
        return False
    con.execute("UPDATE processos SET atualizado_em=? WHERE id=?", (relogio.agora_iso(), pid))
    return True


@router.get("/processos/{pid}/movimentacoes")
def listar_movimentacoes(pid: int, u: sqlite3.Row = Depends(usuario_atual), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    return [dict(m) for m in con.execute("SELECT id,data,tipo,descricao,origem FROM movimentacoes WHERE processo_id=? ORDER BY data DESC,id DESC", (pid,))]


@router.post("/processos/{pid}/movimentacoes", status_code=201)
def criar_movimentacao(pid: int, d: MovimentacaoIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    if not inserir_movimentacao(con, pid, d.data.isoformat(), d.tipo, d.descricao, "manual"):
        raise HTTPException(409, "Este andamento já está registrado.")
    auditoria.registrar(con, u["id"], "processo", pid, "andamento_manual")
    return {"ok": True}


@router.post("/processos/{pid}/movimentacoes/importar")
def importar_movimentacoes(pid: int, itens: list[MovimentacaoIn], u: sqlite3.Row = Depends(exigir_papel(*EDITORES)),
                           con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    novos = sum(inserir_movimentacao(con, pid, i.data.isoformat(), i.tipo, i.descricao, "automatica") for i in itens)
    auditoria.registrar(con, u["id"], "processo", pid, "andamentos_importados", f"{novos}/{len(itens)}")
    return {"inseridos": novos, "ignorados": len(itens) - novos}


def atualizar_do_datajud(con: sqlite3.Connection, p: sqlite3.Row, transporte=None) -> dict:
    movs = datajud.extrair_movimentos(datajud.consultar(p["numero_digitos"], transporte=transporte))
    novos = sum(inserir_movimentacao(con, p["id"], m["data"], m["tipo"], m["descricao"], "automatica") for m in movs)
    return {"inseridos": novos, "ignorados": len(movs) - novos, "total_no_tribunal": len(movs)}


@router.post("/processos/{pid}/consultar-datajud")
def consultar_datajud(pid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    p = acesso.carregar_processo(con, u, pid)
    if p["tipo"] != "judicial" or not p["numero_digitos"]:
        raise HTTPException(422, "Só processo judicial com número CNJ pode ser consultado no DataJud.")
    try:
        r = atualizar_do_datajud(con, p)
    except datajud.DataJudErro as e:
        raise HTTPException(502, str(e))
    auditoria.registrar(con, u["id"], "processo", pid, "datajud", str(r["inseridos"]))
    return r


# ---------- vínculos ----------
class VinculoIn(BaseModel):
    outro_id: int
    tipo: Literal["apenso", "dependencia", "recurso", "conexao", "execucao", "cautelar", "outro"] = "conexao"
    observacao: str | None = None


@router.post("/processos/{pid}/vinculos", status_code=201)
def criar_vinculo(pid: int, d: VinculoIn, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    acesso.carregar_processo(con, u, pid)
    acesso.carregar_processo(con, u, d.outro_id)
    if pid == d.outro_id:
        raise HTTPException(422, "Um processo não pode ser vinculado a ele mesmo.")
    if con.execute("SELECT 1 FROM vinculos WHERE (processo_a=? AND processo_b=?) OR (processo_a=? AND processo_b=?)",
                   (pid, d.outro_id, d.outro_id, pid)).fetchone():
        raise HTTPException(409, "Estes processos já estão vinculados.")
    cur = con.execute("INSERT INTO vinculos(processo_a,processo_b,tipo,observacao) VALUES(?,?,?,?)", (pid, d.outro_id, d.tipo, d.observacao))
    auditoria.registrar(con, u["id"], "processo", pid, "vinculo", f"{d.tipo}:{d.outro_id}")
    return {"id": cur.lastrowid}


@router.delete("/vinculos/{vid}")
def remover_vinculo(vid: int, u: sqlite3.Row = Depends(exigir_papel(*EDITORES)), con: sqlite3.Connection = Depends(get_db)):
    v = con.execute("SELECT * FROM vinculos WHERE id=?", (vid,)).fetchone()
    if not v:
        raise HTTPException(404, "Vínculo não encontrado.")
    acesso.carregar_processo(con, u, v["processo_a"])
    con.execute("DELETE FROM vinculos WHERE id=?", (vid,))
    auditoria.registrar(con, u["id"], "processo", v["processo_a"], "vinculo_removido", str(vid))
    return {"ok": True}
