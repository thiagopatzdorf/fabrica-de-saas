"""Banco SQLite: esquema versionado por `PRAGMA user_version`."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from . import config
from .regras_prazo import normalizar

SCHEMA_V1 = """
CREATE TABLE usuarios(
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK(papel IN('admin','advogado','estagiario','financeiro')),
  oab TEXT, telefone TEXT,
  canais_alerta TEXT NOT NULL DEFAULT 'app,email',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE TABLE clientes(
  id INTEGER PRIMARY KEY,
  tipo_pessoa TEXT NOT NULL CHECK(tipo_pessoa IN('PF','PJ')),
  nome TEXT NOT NULL,
  documento TEXT, documento_digitos TEXT NOT NULL DEFAULT '',
  email TEXT, telefone TEXT, endereco TEXT, observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_clientes_doc ON clientes(documento_digitos);
CREATE UNIQUE INDEX idx_clientes_doc_unico ON clientes(documento_digitos) WHERE documento_digitos != '';

CREATE TABLE processos(
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  tipo TEXT NOT NULL CHECK(tipo IN('judicial','administrativo','extrajudicial')),
  numero TEXT, numero_digitos TEXT NOT NULL DEFAULT '',
  numero_legado INTEGER NOT NULL DEFAULT 0,
  tribunal TEXT, tribunal_codigo TEXT, uf TEXT,
  vara TEXT, comarca TEXT, classe TEXT, assunto TEXT,
  polo_cliente TEXT NOT NULL DEFAULT 'ativo' CHECK(polo_cliente IN('ativo','passivo','terceiro')),
  fase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN('ativo','suspenso','arquivado','encerrado')),
  valor_causa_centavos INTEGER,
  data_distribuicao TEXT,
  restrito INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_processos_numero ON processos(numero_digitos) WHERE numero_digitos != '';
CREATE INDEX idx_processos_cliente ON processos(cliente_id);

CREATE TABLE partes(
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  documento TEXT, documento_digitos TEXT NOT NULL DEFAULT '',
  polo TEXT NOT NULL CHECK(polo IN('ativo','passivo','terceiro')),
  papel TEXT NOT NULL DEFAULT 'parte' CHECK(papel IN('parte','advogado','perito','testemunha','outro')),
  oab TEXT
);
CREATE INDEX idx_partes_processo ON partes(processo_id);
CREATE INDEX idx_partes_doc ON partes(documento_digitos);

CREATE TABLE processo_responsaveis(
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  papel TEXT NOT NULL DEFAULT 'responsavel' CHECK(papel IN('responsavel','colaborador')),
  PRIMARY KEY(processo_id, usuario_id)
);
CREATE TABLE fases_historico(
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  fase TEXT NOT NULL, desde TEXT NOT NULL, por_usuario_id INTEGER REFERENCES usuarios(id)
);
CREATE TABLE movimentacoes(
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  data TEXT NOT NULL, tipo TEXT, descricao TEXT NOT NULL,
  origem TEXT NOT NULL CHECK(origem IN('manual','automatica','publicacao')),
  hash TEXT NOT NULL, criado_em TEXT NOT NULL,
  UNIQUE(processo_id, hash)
);
CREATE INDEX idx_mov_processo ON movimentacoes(processo_id, data DESC);
CREATE TABLE vinculos(
  id INTEGER PRIMARY KEY,
  processo_a INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  processo_b INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK(tipo IN('apenso','dependencia','recurso','conexao','execucao','cautelar','outro')),
  observacao TEXT,
  CHECK(processo_a != processo_b),
  UNIQUE(processo_a, processo_b)
);

CREATE TABLE feriados(
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL, nome TEXT NOT NULL,
  escopo TEXT NOT NULL CHECK(escopo IN('estadual','municipal','forense')),
  tribunal TEXT NOT NULL DEFAULT '',
  UNIQUE(data, tribunal)
);
CREATE TABLE publicacoes(
  id INTEGER PRIMARY KEY,
  fonte TEXT NOT NULL, data_disponibilizacao TEXT NOT NULL,
  texto TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  numero_encontrado TEXT,
  status TEXT NOT NULL DEFAULT 'nova' CHECK(status IN('nova','vinculada','tratada','descartada')),
  sugestao_json TEXT NOT NULL DEFAULT '[]',
  criado_em TEXT NOT NULL
);
CREATE TABLE prazos(
  id INTEGER PRIMARY KEY,
  processo_id INTEGER NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL, categoria TEXT,
  evento TEXT NOT NULL DEFAULT 'ciencia' CHECK(evento IN('ciencia','disponibilizacao_dje','manual')),
  data_evento TEXT, dias INTEGER,
  contagem TEXT NOT NULL DEFAULT 'uteis' CHECK(contagem IN('uteis','corridos')),
  dobro INTEGER NOT NULL DEFAULT 0, suspender_recesso INTEGER NOT NULL DEFAULT 1,
  data_fatal TEXT NOT NULL, data_interna TEXT, margem_dias INTEGER NOT NULL DEFAULT 2,
  responsavel_id INTEGER REFERENCES usuarios(id),
  revisor_id INTEGER REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK(status IN('pendente','em_andamento','em_revisao','concluido','perdido','cancelado')),
  memoria_calculo TEXT, base_legal TEXT,
  publicacao_id INTEGER REFERENCES publicacoes(id) ON DELETE SET NULL,
  concluido_em TEXT, concluido_por INTEGER REFERENCES usuarios(id),
  criado_por INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_prazos_fatal ON prazos(data_fatal, status);
CREATE INDEX idx_prazos_processo ON prazos(processo_id);
CREATE TABLE prazo_historico(
  id INTEGER PRIMARY KEY,
  prazo_id INTEGER NOT NULL REFERENCES prazos(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id),
  acao TEXT NOT NULL, campo TEXT, de TEXT, para TEXT, em TEXT NOT NULL
);
CREATE TABLE eventos(
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK(tipo IN('audiencia','reuniao','sustentacao_oral','compromisso','pericia','diligencia','vencimento_financeiro')),
  titulo TEXT NOT NULL,
  inicio TEXT NOT NULL, fim TEXT, dia_inteiro INTEGER NOT NULL DEFAULT 0,
  local TEXT, descricao TEXT,
  processo_id INTEGER REFERENCES processos(id) ON DELETE SET NULL,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  responsavel_id INTEGER REFERENCES usuarios(id),
  valor_centavos INTEGER, concluido INTEGER NOT NULL DEFAULT 0,
  criado_por INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL
);
CREATE INDEX idx_eventos_inicio ON eventos(inicio);
CREATE TABLE alertas(
  id INTEGER PRIMARY KEY,
  origem TEXT NOT NULL CHECK(origem IN('prazo','evento')),
  origem_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  canal TEXT NOT NULL CHECK(canal IN('app','email','whatsapp')),
  antecedencia_dias INTEGER NOT NULL,
  enviar_em TEXT NOT NULL, mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','enviado','falhou','sem_provedor','lido')),
  tentativas INTEGER NOT NULL DEFAULT 0, erro TEXT, criado_em TEXT NOT NULL,
  UNIQUE(origem, origem_id, usuario_id, canal, antecedencia_dias)
);

CREATE TABLE pastas(
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
  processo_id INTEGER REFERENCES processos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0,
  CHECK((cliente_id IS NOT NULL) != (processo_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_pastas_processo ON pastas(processo_id, nome) WHERE processo_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pastas_cliente ON pastas(cliente_id, nome) WHERE cliente_id IS NOT NULL;
CREATE TABLE documentos(
  id INTEGER PRIMARY KEY,
  pasta_id INTEGER NOT NULL REFERENCES pastas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, versao_atual INTEGER NOT NULL DEFAULT 1,
  criado_por INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL,
  excluido_em TEXT
);
CREATE TABLE documento_versoes(
  id INTEGER PRIMARY KEY,
  documento_id INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL, sha256 TEXT NOT NULL, tamanho INTEGER NOT NULL, mime TEXT,
  arquivo TEXT NOT NULL, texto TEXT NOT NULL DEFAULT '',
  ocr_status TEXT NOT NULL DEFAULT 'nao_aplicavel'
    CHECK(ocr_status IN('nao_aplicavel','feito','indisponivel','falhou')),
  comentario TEXT, enviado_por INTEGER REFERENCES usuarios(id), enviado_em TEXT NOT NULL,
  UNIQUE(documento_id, numero)
);
CREATE VIRTUAL TABLE busca_documentos USING fts5(
  nome, texto, documento_id UNINDEXED, versao_id UNINDEXED, tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE assinaturas(
  id INTEGER PRIMARY KEY,
  versao_id INTEGER NOT NULL REFERENCES documento_versoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, documento_cpf TEXT, email TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  metodo TEXT NOT NULL CHECK(metodo IN('login','link')),
  sha256 TEXT NOT NULL, assinado_em TEXT NOT NULL, ip TEXT, selo TEXT NOT NULL
);
CREATE TABLE solicitacoes_assinatura(
  id INTEGER PRIMARY KEY,
  versao_id INTEGER NOT NULL REFERENCES documento_versoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT,
  token_hash TEXT NOT NULL UNIQUE, expira_em TEXT NOT NULL, usada_em TEXT,
  criado_por INTEGER REFERENCES usuarios(id), criado_em TEXT NOT NULL
);
CREATE TABLE modelos(
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE, categoria TEXT, corpo TEXT NOT NULL,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE TABLE auditoria(
  id INTEGER PRIMARY KEY,
  em TEXT NOT NULL, usuario_id INTEGER, entidade TEXT NOT NULL, entidade_id INTEGER,
  acao TEXT NOT NULL, detalhes TEXT
);
CREATE INDEX idx_auditoria_entidade ON auditoria(entidade, entidade_id);
"""

MIGRACOES = [SCHEMA_V1]


def conectar(caminho: Path | str | None = None) -> sqlite3.Connection:
    con = sqlite3.connect(str(caminho or config.caminho_banco()), check_same_thread=False, timeout=15)
    con.row_factory = sqlite3.Row
    con.create_function("norm", 1, lambda t: normalizar(t or ""), deterministic=True)
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    return con


def migrar(con: sqlite3.Connection) -> int:
    versao = con.execute("PRAGMA user_version").fetchone()[0]
    for i, sql in enumerate(MIGRACOES[versao:], start=versao + 1):
        con.executescript(sql)
        con.execute(f"PRAGMA user_version={i}")
    con.commit()
    return len(MIGRACOES)
