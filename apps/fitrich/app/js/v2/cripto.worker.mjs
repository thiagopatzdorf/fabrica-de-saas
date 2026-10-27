// Web Worker do backup cifrado: as 600 mil iterações do PBKDF2 levam de 0,3 a 2 s num
// celular, e na thread da página isso congelaria a interface. A página fala com ele por
// mensagens; a senha vai na mensagem e não é guardada aqui.
//
// Uso (na página):  const w = new Worker("/js/v2/cripto.worker.mjs", { type: "module" });
//   w.postMessage({ id, op: "cifrar", texto, senha });   -> { id, ok: true, resultado }
//   w.postMessage({ id, op: "decifrar", arquivo, senha });-> { id, ok: true, resultado } | { id, ok: false, erro }
// Carregado sob demanda (só na aba Dados), por isso não pesa na página inicial.
import { cifrar, decifrar } from "./cripto.mjs";

self.addEventListener("message", async (e) => {
  const { id, op, texto, arquivo, senha } = e.data || {};
  try {
    if (op === "cifrar") self.postMessage({ id, ok: true, resultado: await cifrar(texto, senha) });
    else if (op === "decifrar") self.postMessage({ id, ok: true, resultado: await decifrar(arquivo, senha) });
    else throw new Error(`operação desconhecida: ${String(op)}`);
  } catch (erro) {
    self.postMessage({ id, ok: false, erro: erro && erro.message ? erro.message : String(erro) });
  }
});
