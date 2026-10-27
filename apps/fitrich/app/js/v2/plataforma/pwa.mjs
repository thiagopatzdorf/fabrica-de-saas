// Registro do service worker e o ciclo de atualização ("nova versão disponível → atualizar"), sem DOM:
// a interface (shell.mjs) só reage a `estado`. Dá para testar com navegador falso.
//
// Regras: o sw.js NUNCA faz skipWaiting sozinho. A versão nova fica em `registration.waiting` até a pessoa
// tocar em "Atualizar"; só então mandamos "skipWaiting" e recarregamos quando o controlador troca. Assim um
// lançamento no meio da digitação não se perde, e a migração de schema roda no app, nunca no worker.
// Os DADOS não passam por aqui: IndexedDB e localStorage ficam intactos em qualquer atualização.
//
// Duas abas: a que clicou recarrega sozinha; as outras só ganham um aviso "recarregue" (a aba velha com a
// tela nova misturaria versões de módulos), nunca um reload surpresa.
export const SW = "/sw.js";
export const INTERVALO_CHECAGEM_MS = 3_600_000;

export function criarPWA({ nav = globalThis.navigator, win = globalThis.window, doc = globalThis.document, agora = Date.now, aoMudar = () => {} } = {}) {
  const sw = nav?.serviceWorker;
  const estado = { suporte: Boolean(sw), controlado: Boolean(sw?.controller), atualizacaoPronta: false, recarregarOutraAba: false, erro: null };
  let reg = null, aplicando = false, recarregando = false, ultimaChecagem = -Infinity, tinhaControlador = estado.controlado;
  const avisar = () => aoMudar({ ...estado });

  function verEspera() {
    if (reg?.waiting && sw.controller && !estado.atualizacaoPronta) { estado.atualizacaoPronta = true; avisar(); }
  }

  async function registrar() {
    if (!sw) return null;
    sw.addEventListener("controllerchange", () => {
      if (!tinhaControlador) { tinhaControlador = true; estado.controlado = true; avisar(); return; } // 1ª instalação (clients.claim)
      if (aplicando) { if (!recarregando) { recarregando = true; win.location.reload(); } return; }
      estado.recarregarOutraAba = true; avisar();
    });
    try { reg = await sw.register(SW, { type: "classic" }); } catch (e) { estado.erro = String(e?.message ?? e); avisar(); return null; }
    verEspera();
    reg.addEventListener("updatefound", () => {
      const novo = reg.installing;
      novo?.addEventListener("statechange", () => { if (novo.state === "installed") verEspera(); });
    });
    doc?.addEventListener?.("visibilitychange", () => { if (doc.visibilityState === "visible") verificar().catch(() => {}); });
    return reg;
  }

  function aplicarAtualizacao() {
    if (!reg?.waiting) return false;
    aplicando = true;
    reg.waiting.postMessage("skipWaiting");
    return true;
  }

  // `forcar` ignora o intervalo (botão "Verificar agora"). Devolve se há versão nova esperando.
  async function verificar({ forcar = false } = {}) {
    if (!reg || (!forcar && agora() - ultimaChecagem < INTERVALO_CHECAGEM_MS)) return estado.atualizacaoPronta;
    ultimaChecagem = agora();
    try { await reg.update(); } catch { /* sem rede: segue na versão atual */ }
    verEspera();
    return estado.atualizacaoPronta;
  }

  // Versão ativa e quantos arquivos há no pré-cache, perguntando ao worker (ele sabe o próprio nome de cache).
  function versao(timeoutMs = 1500) {
    const alvo = sw?.controller;
    if (!alvo) return Promise.resolve(null);
    return new Promise((resolve) => {
      const fim = setTimeout(() => { sw.removeEventListener("message", ouvir); resolve(null); }, timeoutMs);
      function ouvir(e) { if (e.data?.tipo === "versao") { clearTimeout(fim); sw.removeEventListener("message", ouvir); resolve(e.data); } }
      sw.addEventListener("message", ouvir);
      alvo.postMessage("versao");
    });
  }

  return { estado: () => ({ ...estado }), registrar, aplicarAtualizacao, verificar, versao };
}
