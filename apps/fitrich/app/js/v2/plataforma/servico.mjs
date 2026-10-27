// A plataforma do app como UM objeto: o shell (faixas de aviso) e a tela "App e aparelho" falam com a mesma
// instância (módulo ES é singleton), sem uma importar a outra e sem passar nada novo pelo `ctx`.
import { plataformaDoAmbiente } from "./detectar.mjs";
import { CHAVE_DISPENSADO, criarInstalador, decidirInstalacao } from "./instalar.mjs";
import { criarNativo } from "./nativo.mjs";
import { avaliarPersistencia, lerPersistencia, pedirPersistencia } from "./persistencia.mjs";
import { criarPWA } from "./pwa.mjs";

const ls = (f) => { try { return f(); } catch { return null; } };

export function criarPlataforma({ win = globalThis.window, nav = globalThis.navigator, doc = globalThis.document, agora = Date.now } = {}) {
  const ouvintes = new Set();
  const mudou = () => { for (const f of ouvintes) f(); };
  const plataforma = plataformaDoAmbiente(win, nav);
  const nativo = criarNativo({ win });
  const instalador = criarInstalador({ win, aoMudar: mudou });
  // Na casca nativa não há service worker (o WKWebView do iOS nem o suporta): o próprio app é o pacote.
  const pwa = criarPWA({ nav: nativo.ativo ? null : nav, win, doc, agora, aoMudar: mudou });
  let persist = { suporte: false, persistido: null, usoBytes: null, cotaBytes: null };

  async function lerPersist() { persist = await lerPersistencia(nav); mudou(); return persist; }

  return {
    plataforma, nativo, pwa, instalador,
    aoMudar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    persistencia: () => persist,
    lerPersistencia: lerPersist,
    async pedirPersistencia() { const ok = await pedirPersistencia(nav); await lerPersist(); return ok; },
    avaliarPersistencia: (registros) => avaliarPersistencia({ persistido: persist.persistido, suporte: persist.suporte, plataforma, registros }),
    instalacao({ hoje, registros }) {
      return decidirInstalacao({ plataforma, promptPronto: instalador.promptPronto, instalado: instalador.instalado, dispensadoEm: ls(() => win.localStorage.getItem(CHAVE_DISPENSADO)), hoje, registros });
    },
    dispensarInstalacao(hoje) { ls(() => win.localStorage.setItem(CHAVE_DISPENSADO, hoje)); mudou(); },
    async iniciar() { await pwa.registrar(); await lerPersist(); },
    mudou,
  };
}

let unica = null;
export const plataforma = () => (unica ??= criarPlataforma());
