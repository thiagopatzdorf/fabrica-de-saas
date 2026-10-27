// Faixas de aviso da plataforma no shell (#avisos-app), uma por vez, por prioridade:
//   1. versão nova em outra aba → recarregar        2. versão nova pronta → atualizar
//   3. dados sem garantia de guarda → backup        4. instalar o app (Android/iOS)
// Tudo por h()/icone(): nada de HTML em string. Texto sempre por t() (dicionário plataforma.i18n.mjs).
import { diasEntre } from "../../datas.mjs";
import { h, limpar } from "../ui/h.mjs";
import { icone } from "../ui/icones.mjs";
import { plataforma as obter } from "./servico.mjs";

const CHAVE_PERSIST = "fitrich-persist-aviso-dispensado";
const MIN_REGISTROS_PERSIST = 3; // só avisa de armazenamento depois de a pessoa ter algo a perder
const DIAS_PERSIST = 30;
const ls = (f) => { try { return f(); } catch { return null; } };

export async function iniciarPlataforma({ t, alvo, estado, hoje, serv = obter() }) {
  const registros = () => (estado()?.lancamentos?.length ?? 0) + (estado()?.pesos?.length ?? 0) + (estado()?.treinos?.length ?? 0);
  let aplicando = false;

  function persistRecente() {
    const v = ls(() => localStorage.getItem(CHAVE_PERSIST));
    return Boolean(v) && diasEntre(v, hoje()) < DIAS_PERSIST;
  }
  const faixa = (classe, nome, texto, ...acoes) => h("div", { class: ["aviso", classe], role: "status" }, icone(nome),
    h("div", { class: "aviso-corpo" }, h("p", null, texto), acoes.length ? h("div", { class: "acoes" }, ...acoes) : null));
  const botao = (rotulo, onclick, extra = "leve") => h("button", { type: "button", class: ["botao", extra], onclick }, rotulo);

  function render() {
    limpar(alvo);
    const pwa = serv.pwa.estado();
    if (pwa.recarregarOutraAba) return alvo.append(faixa("atencao", "atencao", t("plat.outraAba.texto"), botao(t("plat.outraAba.botao"), () => location.reload())));
    if (pwa.atualizacaoPronta) {
      return alvo.append(faixa("", "info", t("plat.atualizar.texto"),
        h("button", { type: "button", class: "botao", disabled: aplicando, onclick: () => { aplicando = true; serv.pwa.aplicarAtualizacao(); render(); } },
          t(aplicando ? "plat.atualizar.aplicando" : "plat.atualizar.botao"))));
    }
    const n = registros();
    const p = serv.avaliarPersistencia(n);
    if (p.precisaAviso && n >= MIN_REGISTROS_PERSIST && !persistRecente() && serv.persistencia().persistido !== null) {
      return alvo.append(faixa("atencao", "cadeado", t(`plat.persist.${p.codigo}`),
        h("a", { class: "botao leve", href: "#/dados" }, t("plat.irDados")),
        botao(t("plat.instalar.depois"), () => { ls(() => localStorage.setItem(CHAVE_PERSIST, hoje())); render(); })));
    }
    const i = serv.instalacao({ hoje: hoje(), registros: n });
    if (!i.mostrarFaixa) return;
    const depois = botao(t("plat.instalar.depois"), () => { serv.dispensarInstalacao(hoje()); });
    if (i.modo === "nativo") alvo.append(faixa("", "instalar", t("plat.instalar.texto"), botao(t("plat.instalar.botao"), () => serv.instalador.instalar(), ""), depois));
    else if (i.modo === "ios") alvo.append(faixa("", "instalar", t("plat.instalar.ios.texto"), depois));
  }

  serv.aoMudar(render);
  render();
  await serv.iniciar();
  // Um pedido de persistência por sessão, depois de a pessoa ter registrado algo (Chrome concede por engajamento;
  // Firefox mostra o prompt dele): pedir no primeiro quadro seria pedir antes de haver o que proteger.
  if (registros() >= 1 && serv.persistencia().persistido === false) await serv.pedirPersistencia();
  return { render, serv };
}
