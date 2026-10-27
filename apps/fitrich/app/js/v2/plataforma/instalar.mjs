// Instalação do app. Três caminhos, escolhidos por `decidirInstalacao` (puro):
//   nativo   Chromium/Android: o navegador entregou `beforeinstallprompt`; um botão nosso o dispara.
//   ios      Safari não tem prompt: instrução explícita (Compartilhar → Adicionar à Tela de Início).
//   manual   o resto (Firefox, Chrome de desktop sem o evento): só a dica de menu, na tela "App e aparelho".
// A faixa só aparece depois do primeiro registro (a pessoa já tem o que proteger) e some por 30 dias
// quando dispensada. Nada daqui fala com a rede.
import { diasEntre } from "../../datas.mjs";

export const DIAS_SEM_INCOMODAR = 30;
export const CHAVE_DISPENSADO = "fitrich-instalar-dispensado";

export function decidirInstalacao({ plataforma, promptPronto = false, instalado = false, dispensadoEm = null, hoje, registros = 0 }) {
  if (instalado || plataforma.standalone) return { modo: "nenhum", motivo: "instalado", mostrarFaixa: false };
  const modo = promptPronto ? "nativo" : plataforma.ios ? "ios" : "manual";
  const dispensadoRecente = Boolean(dispensadoEm) && diasEntre(String(dispensadoEm).slice(0, 10), hoje) < DIAS_SEM_INCOMODAR;
  return { modo, motivo: modo, mostrarFaixa: modo !== "manual" && registros >= 1 && !dispensadoRecente };
}

export function criarInstalador({ win = globalThis.window, aoMudar = () => {} } = {}) {
  let adiado = null, instalado = false;
  win?.addEventListener?.("beforeinstallprompt", (e) => { e.preventDefault(); adiado = e; aoMudar(); });
  win?.addEventListener?.("appinstalled", () => { instalado = true; adiado = null; aoMudar(); });
  return {
    get promptPronto() { return Boolean(adiado); },
    get instalado() { return instalado; },
    // Devolve "accepted" | "dismissed" | null (sem prompt guardado). O evento só serve uma vez.
    async instalar() {
      if (!adiado) return null;
      const e = adiado; adiado = null; aoMudar();
      try { await e.prompt(); const r = await e.userChoice; return r?.outcome ?? null; } catch { return null; }
    },
  };
}
