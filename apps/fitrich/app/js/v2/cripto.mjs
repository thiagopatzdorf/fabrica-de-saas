// Backup cifrado do Fitrich: PBKDF2-HMAC-SHA-256 (≥ 600 mil iterações, sal de 16 B) deriva
// uma chave AES-256-GCM (IV de 12 B) com a WebCrypto do próprio navegador. Zero dependência.
//
// O QUE ISTO PROTEGE: o arquivo de backup fora do aparelho (Drive, e-mail, pen drive,
// pasta de nuvem). Quem pegar o arquivo sem a senha vê só o cabeçalho (formato, versão,
// parâmetros) e bytes aleatórios. Senha errada ou arquivo adulterado falham na tag do
// GCM: nada é devolvido pela metade.
//
// O QUE ISTO NÃO PROTEGE: malware ou alguém com acesso ao aparelho desbloqueado (os
// dados ficam EM CLARO no armazenamento local, pois criptografia em repouso não foi
// implementada nesta etapa); senha fraca (600 mil iterações encarecem o chute, não o
// impedem: "123456" cai em segundos); perda da senha (não há recuperação, por desenho).
//
// Formato do arquivo (texto, JSON): cabeçalho claro + corpo base64.
//   {"fmt":"fitrich-enc","v":1,"kdf":"pbkdf2-sha256","iter":600000,"salt":"<b64 16 B>","iv":"<b64 12 B>","dados":"<b64 cifra+tag>"}
// O campo `kdf` existe para trocar por Argon2id no futuro sem quebrar arquivos antigos:
// `decifrar` recusa kdf desconhecido em vez de adivinhar.
//
// Sem DOM e sem relógio: `cripto` (WebCrypto) é injetável, por isso roda em Node 18 nos
// testes e em Web Worker no navegador (cripto.worker.mjs).

export const FORMATO = "fitrich-enc";
export const VERSAO = 1;
export const KDF = "pbkdf2-sha256";
// Piso de iterações (OWASP 2023 para PBKDF2-HMAC-SHA-256). Vale para cifrar E para
// decifrar: um arquivo com `iter` menor é recusado, para ninguém "rebaixar" o custo
// trocando um número no cabeçalho (ataque de downgrade).
export const ITERACOES_MINIMAS = 600_000;
export const SAL_BYTES = 16;
export const IV_BYTES = 12;

const enc = new TextEncoder(), dec = new TextDecoder();

export function paraBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function deBase64(texto) {
  if (typeof texto !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(texto)) throw new Error("base64 inválido");
  const s = atob(texto), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function chave(senha, sal, iter, cripto) {
  const base = await cripto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveKey"]);
  return cripto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Cifra `textoJSON` com `senha`. Sal e IV novos a cada chamada (do CSPRNG). Devolve o arquivo como texto JSON. */
export async function cifrar(textoJSON, senha, { iter = ITERACOES_MINIMAS, cripto = globalThis.crypto } = {}) {
  if (typeof textoJSON !== "string") throw new Error("cifrar espera texto (JSON já serializado)");
  if (typeof senha !== "string" || senha.length === 0) throw new Error("senha vazia");
  if (!Number.isInteger(iter) || iter < ITERACOES_MINIMAS) throw new Error(`iterações abaixo do piso (${ITERACOES_MINIMAS})`);
  const sal = cripto.getRandomValues(new Uint8Array(SAL_BYTES)), iv = cripto.getRandomValues(new Uint8Array(IV_BYTES));
  const k = await chave(senha, sal, iter, cripto);
  const cifra = new Uint8Array(await cripto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(textoJSON)));
  return JSON.stringify({ fmt: FORMATO, v: VERSAO, kdf: KDF, iter, salt: paraBase64(sal), iv: paraBase64(iv), dados: paraBase64(cifra) });
}

/** Lê e valida só o cabeçalho (sem senha): útil para a UI dizer "este é um backup cifrado do Fitrich". */
export function lerCabecalho(arquivo) {
  let c;
  try { c = JSON.parse(arquivo); } catch { throw new Error("não é um arquivo JSON"); }
  if (!c || c.fmt !== FORMATO) throw new Error("não é um backup cifrado do Fitrich");
  if (c.v !== VERSAO) throw new Error(`versão ${c.v} desconhecida`);
  if (c.kdf !== KDF) throw new Error(`kdf ${String(c.kdf)} não suportado`);
  if (!Number.isInteger(c.iter) || c.iter < ITERACOES_MINIMAS) throw new Error(`iterações abaixo do piso (${ITERACOES_MINIMAS}): arquivo recusado`);
  const salt = deBase64(c.salt), iv = deBase64(c.iv), dados = deBase64(c.dados);
  if (salt.length !== SAL_BYTES) throw new Error("sal com tamanho errado");
  if (iv.length !== IV_BYTES) throw new Error("IV com tamanho errado");
  if (dados.length < 16) throw new Error("corpo menor que a tag de autenticação");
  return { fmt: c.fmt, v: c.v, kdf: c.kdf, iter: c.iter, salt, iv, dados };
}

/** Decifra `arquivo` (texto JSON gerado por `cifrar`) com `senha`. Senha errada ou arquivo
 *  adulterado lançam `Error("senha incorreta ou arquivo adulterado")`, sem devolver nada. */
export async function decifrar(arquivo, senha, { cripto = globalThis.crypto } = {}) {
  const c = lerCabecalho(arquivo);
  if (typeof senha !== "string" || senha.length === 0) throw new Error("senha vazia");
  const k = await chave(senha, c.salt, c.iter, cripto);
  let claro;
  try { claro = await cripto.subtle.decrypt({ name: "AES-GCM", iv: c.iv }, k, c.dados); } catch {
    // A WebCrypto devolve um OperationError genérico: não dá (nem deve dar) para distinguir
    // senha errada de arquivo mexido, e a mensagem é a mesma de propósito.
    throw new Error("senha incorreta ou arquivo adulterado");
  }
  return dec.decode(claro);
}
