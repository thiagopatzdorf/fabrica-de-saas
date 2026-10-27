-- Ponto Eletrônico: ponto com localização e rosto, espelho do mês para o RH. Um banco (D1) para todas as
-- empresas; toda linha carrega `empresa` e toda consulta filtra por ela (teste "isolamento").
-- Marcação nunca é alterada nem apagada: correção é um `ajuste` à parte, com motivo e autor.
CREATE TABLE IF NOT EXISTS empresas (id TEXT PRIMARY KEY, nome TEXT NOT NULL, cnpj TEXT NOT NULL, criado INTEGER NOT NULL,
  limiar REAL NOT NULL DEFAULT 0.55, limiar_revisao REAL NOT NULL DEFAULT 0.42, nsr INTEGER NOT NULL DEFAULT 0,
  real_minimo REAL NOT NULL DEFAULT 0.45, exigir_piscar INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS convites_usados (id TEXT PRIMARY KEY, usado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rh (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, nome TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessoes (hash TEXT PRIMARY KEY, tipo TEXT NOT NULL, quem TEXT NOT NULL, empresa TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 0, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locais (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, nome TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
  raio_m INTEGER NOT NULL, exigir INTEGER NOT NULL DEFAULT 1, criado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS funcionarios (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, nome TEXT NOT NULL, cpf_hash TEXT NOT NULL,
  cpf_cifrado TEXT NOT NULL, matricula TEXT, jornada_min INTEGER NOT NULL DEFAULT 480, intervalo_min INTEGER NOT NULL DEFAULT 60,
  local TEXT, ativo INTEGER NOT NULL DEFAULT 1, admissao TEXT, criado INTEGER NOT NULL,
  dispositivo INTEGER NOT NULL DEFAULT 0, ativacao_hash TEXT, ativacao_expira INTEGER,
  rosto TEXT, rosto_em INTEGER, consentimento_em INTEGER, termo_versao TEXT,
  UNIQUE (empresa, cpf_hash));
CREATE INDEX IF NOT EXISTS funcionarios_empresa ON funcionarios (empresa, ativo);
CREATE TABLE IF NOT EXISTS marcacoes (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, funcionario TEXT NOT NULL, nsr INTEGER NOT NULL,
  quando INTEGER NOT NULL, lat REAL, lng REAL, precisao_m REAL, local TEXT, distancia_m REAL, dentro INTEGER NOT NULL,
  semelhanca REAL NOT NULL, real REAL, vivo REAL, revisar INTEGER NOT NULL DEFAULT 0, ip_hash TEXT,
  hash_anterior TEXT NOT NULL, hash TEXT NOT NULL, UNIQUE (empresa, nsr));
CREATE INDEX IF NOT EXISTS marcacoes_mes ON marcacoes (empresa, funcionario, quando);
CREATE TABLE IF NOT EXISTS fotos (marcacao TEXT PRIMARY KEY, empresa TEXT NOT NULL, jpeg BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS ajustes (id TEXT PRIMARY KEY, empresa TEXT NOT NULL, funcionario TEXT NOT NULL, tipo TEXT NOT NULL,
  quando INTEGER, marcacao TEXT, motivo TEXT NOT NULL, autor TEXT NOT NULL, criado INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ajustes_func ON ajustes (empresa, funcionario);
CREATE TABLE IF NOT EXISTS auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa TEXT NOT NULL, quem TEXT NOT NULL,
  acao TEXT NOT NULL, detalhe TEXT NOT NULL, quando INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS auditoria_empresa ON auditoria (empresa, id);
CREATE TABLE IF NOT EXISTS limites (chave TEXT PRIMARY KEY, n INTEGER NOT NULL, ate INTEGER NOT NULL);
