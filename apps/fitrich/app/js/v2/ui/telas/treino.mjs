// Tela Treino: o motor de treino do Fitrich em cinco abas — Treinar (sessão ao vivo), Rotinas (programas e
// edição), Progresso (volume, platô, deload, 1RM, recordes), Cardio e Exercícios (biblioteca). A regra vive em
// js/v2/treino/ (módulos puros, testados em Node); aqui só se monta o DOM. Cada sessão concluída e cada cardio
// geram também um registro simples em `treinos`, então Shape, Metas e Hoje contam o treino sem mudar nada.
import { sessaoEmAndamento } from "../../treino/sessao.mjs";
import { nota } from "./_comum.mjs";
import * as treinar from "./treino/treinar.mjs";
import * as rotinas from "./treino/rotinas.mjs";
import * as progresso from "./treino/progresso.mjs";
import * as cardio from "./treino/cardio.mjs";
import * as biblioteca from "./treino/biblioteca.mjs";

export const ABAS = ["treinar", "rotinas", "progresso", "cardio", "biblioteca"];
const MODULOS = { treinar, rotinas, progresso, cardio, biblioteca };

export const tela = {
  id: "treino", titulo: "tela.treino", icone: "treino", grupo: "mais", ordem: 65,
  css: ["/css/_telas.css", "/css/treino.css"], i18n: "/js/v2/ui/telas/treino.i18n.mjs",
  montar(ctx) {
    const { h, t } = ctx;
    const raiz = h("div", { class: "tela-treino" });
    // Estado de interface que sobrevive às re-renderizações (cada `mudar` re-renderiza a tela).
    const ui = { aba: "treinar", msg: null, foco: null, extras: [], descanso: null, recordes: null, anuncio: "", intervalo: null, semana: 0, rotinaAberta: null, wake: null };
    function render() {
      clearInterval(ui.intervalo);
      const d = ctx.estado(), ao = sessaoEmAndamento(d);
      // Sessão aberta abre a aba Treinar sozinha (quem voltou ao app no meio do treino quer ver a série).
      if (ao && !ui.viuAberta) { ui.aba = "treinar"; ui.viuAberta = true; }
      if (!ao) ui.viuAberta = false;
      ctx.limpar(raiz);
      raiz.append(h("nav", { class: "treino-abas", "aria-label": t("treino.abas") }, ABAS.map((a) => h("button", { type: "button", class: "treino-aba", "aria-current": ui.aba === a ? "page" : null, onclick: () => { if (ui.aba !== a) { ui.aba = a; ui.msg = null; render(); } } }, t(`treino.aba.${a}`)))),
        ...MODULOS[ui.aba].aba(ctx, ui, render, raiz),
        nota(h, t("treino.aviso"), "treino-aviso"));
      telaCheia(ao);
    }
    // Tela acesa durante a sessão (academia: o celular apaga entre as séries). Só quando o navegador deixa.
    async function telaCheia(ligar) {
      try {
        if (ligar && !ui.wake && navigator.wakeLock) { ui.wake = await navigator.wakeLock.request("screen"); ui.wake.addEventListener("release", () => { ui.wake = null; }); }
        else if (!ligar && ui.wake) { await ui.wake.release(); ui.wake = null; }
      } catch { ui.wake = null; }
    }
    ui.rerender = render;
    render();
    return { elemento: raiz, atualizar: render, destruir() { clearInterval(ui.intervalo); telaCheia(false); } };
  },
};
