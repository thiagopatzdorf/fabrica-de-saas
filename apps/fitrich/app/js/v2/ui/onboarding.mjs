// Onboarding de 3 passos no primeiro uso: idioma, objetivo (finanças, corpo ou os dois) e, se a pessoa quiser,
// a primeira conta e o primeiro peso. Pular é possível em TODOS os passos (botão, Esc e fundo) e conta como
// "feito": ninguém é parado por formulário. Só entra para quem tem o app vazio (decisão do shell). O objetivo
// e o "já vi" ficam no aparelho (preferencias.mjs); conta e peso entram pelo `mudar` como qualquer lançamento.
import { adicionar } from "../esquema.mjs";
import { gravarObjetivo, gravarOnboarding, lerObjetivo, lerOnboarding, OBJETIVOS } from "./preferencias.mjs";
import { icone } from "./icones.mjs";

const TOTAL = 3;

// ctx: o ctx do app. opcoes.comecarEm: 2 quando o passo 1 (idioma) já foi resolvido antes de recarregar a página.
export function abrirOnboarding(ctx, { comecarEm = 1, aoFechar = () => {} } = {}) {
  const { h, limpar, t } = ctx;
  const idioma = ctx.idioma();
  let passo = comecarEm, objetivo = lerObjetivo(), idiomaEscolhido = idioma, concluido = false;
  const corpo = h("div", { class: "onb-corpo" });
  const dlg = h("dialog", { class: "folha onboarding", "aria-labelledby": "onb-titulo", "aria-describedby": "onb-texto" }, corpo);
  const fechar = (feito) => { if (!concluido) { concluido = true; gravarOnboarding("feito"); } if (dlg.open) dlg.close(); dlg.remove(); aoFechar(feito); };
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); fechar(false); }); // Esc = pular
  dlg.addEventListener("click", (e) => { if (e.target === dlg) fechar(false); });

  const opcao = ({ nome, valor, marcado, rotulo, descricao, aoMarcar }) => {
    const id = `onb-${nome}-${valor}`;
    return h("label", { class: "onb-opcao", for: id },
      h("input", { type: "radio", name: nome, id, value: valor, checked: marcado, onchange: () => aoMarcar(valor) }),
      h("span", { class: "onb-opcao-texto" }, h("b", null, rotulo), descricao ? h("small", null, descricao) : null));
  };
  const cabeca = (n, titulo, texto) => [
    h("div", { class: "onb-topo" },
      h("p", { class: "onb-passo" }, t("onb.passo", { n, de: TOTAL })),
      h("div", { class: "onb-pontos", "aria-hidden": "true" }, ...[1, 2, 3].map((i) => h("i", { class: i <= n ? "feito" : null })))),
    h("span", { class: "marca-ouro", "aria-hidden": "true" }),
    h("h2", { id: "onb-titulo", tabindex: "-1" }, titulo),
    h("p", { id: "onb-texto", class: "nota" }, texto)];
  const rodape = (...botoes) => h("div", { class: "onb-rodape" }, ...botoes);
  const pular = () => h("button", { type: "button", class: "botao fino", onclick: () => fechar(false) }, t("onb.pular"));

  function p1() {
    return [...cabeca(1, t("onb.p1.titulo"), t("onb.p1.texto")),
      h("fieldset", { class: "onb-grupo" }, h("legend", { class: "oculto" }, t("onb.p1.grupo")),
        ...["pt-BR", "en"].map((v) => opcao({ nome: "idioma", valor: v, marcado: v === idiomaEscolhido, rotulo: t(v === "en" ? "onb.idioma.en" : "onb.idioma.pt"), aoMarcar: (x) => { idiomaEscolhido = x; } }))),
      rodape(pular(), h("button", { type: "button", class: "botao", onclick: () => {
        if (idiomaEscolhido !== idioma) { // a página é por idioma (/ e /en/): troca e retoma no passo 2
          try { localStorage.setItem("fitrich-idioma", idiomaEscolhido); } catch { /* sem armazenamento: a URL já manda */ }
          gravarOnboarding("idioma");
          location.href = `${idiomaEscolhido === "en" ? "/en/" : "/"}${location.hash}`;
          return;
        }
        ir(2);
      } }, t("onb.continuar"), icone("seta")))];
  }
  function p2() {
    return [...cabeca(2, t("onb.p2.titulo"), t("onb.p2.texto")),
      h("fieldset", { class: "onb-grupo" }, h("legend", { class: "oculto" }, t("onb.p2.grupo")),
        ...OBJETIVOS.map((v) => opcao({ nome: "objetivo", valor: v, marcado: v === objetivo, rotulo: t(`onb.obj.${v}`), descricao: t(`onb.obj.${v}_d`), aoMarcar: (x) => { objetivo = x; } }))),
      rodape(h("button", { type: "button", class: "botao leve", onclick: () => ir(1) }, t("onb.voltar")), pular(), h("button", { type: "button", class: "botao", onclick: () => { gravarObjetivo(objetivo); ir(3); } }, t("onb.continuar"), icone("seta")))];
  }
  function p3() {
    const comConta = objetivo !== "corpo", comPeso = objetivo !== "financas";
    const erro = h("p", { class: "erro", role: "alert", hidden: true });
    const nome = h("input", { id: "onb-conta", type: "text", maxlength: "60", autocomplete: "off", placeholder: t("onb.conta.nome_ph") });
    const saldo = h("input", { id: "onb-saldo", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: idioma === "en" ? "0.00" : "0,00" });
    const peso = h("input", { id: "onb-peso", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: idioma === "en" ? "80.5" : "80,5", "aria-describedby": "onb-peso-aj" });
    const falha = (chave) => { erro.textContent = t(chave); erro.hidden = false; };
    const form = h("form", { class: "onb-form", novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); erro.hidden = true;
      const { centavosDeTexto, numeroDeTexto } = await import("./telas/_comum.mjs");
      const nomeConta = nome.value.trim(), saldoTexto = saldo.value.trim(), pesoTexto = peso.value.trim();
      const cents = saldoTexto ? centavosDeTexto(saldoTexto) : 0;
      const kg = pesoTexto ? numeroDeTexto(pesoTexto) : null;
      if (comConta && saldoTexto && cents == null) return falha("onb.erro_saldo");
      if (comPeso && pesoTexto && (kg == null || kg < 20 || kg > 500)) return falha("onb.erro_peso");
      const criarConta = comConta && (nomeConta || saldoTexto), criarPeso = comPeso && kg != null;
      if (criarConta || criarPeso) {
        try {
          await ctx.mudar((d) => {
            let n = d;
            if (criarConta) n = adicionar(n, "contas", { nome: nomeConta || t("conta.carteira"), tipo: "corrente", moeda: d.perfil.moedaPadrao ?? "BRL", saldoInicialCentavos: cents ?? 0, dataSaldoInicial: ctx.hoje(), arquivada: false }, { novoId: ctx.novoId, agora: ctx.agora });
            if (criarPeso) n = adicionar(n, "pesos", { data: ctx.hoje(), kg }, { novoId: ctx.novoId, agora: ctx.agora });
            return n;
          });
        } catch { return falha("onb.erro_gravar"); }
      }
      fechar(true);
    } },
      comConta ? h("div", { class: "onb-campos" },
        h("label", { class: "campo", for: "onb-conta" }, h("span", null, t("onb.conta.nome"))), nome,
        h("label", { class: "campo", for: "onb-saldo" }, h("span", null, t("onb.conta.saldo"))), saldo) : null,
      comPeso ? h("div", { class: "onb-campos" },
        h("label", { class: "campo", for: "onb-peso" }, h("span", null, t("onb.peso"))), peso,
        h("small", { id: "onb-peso-aj", class: "nota" }, t("onb.peso_ajuda"))) : null,
      erro,
      rodape(h("button", { type: "button", class: "botao leve", onclick: () => ir(2) }, t("onb.voltar")), pular(), h("button", { type: "submit", class: "botao" }, t("onb.comecar"))));
    return [...cabeca(3, t("onb.p3.titulo"), t("onb.p3.texto")), form];
  }
  function ir(n) {
    passo = n;
    limpar(corpo).append(...[p1, p2, p3][n - 1]());
    corpo.querySelector("#onb-titulo")?.focus({ preventScroll: true }); // leitor de tela ouve o título do passo
  }
  document.body.append(dlg);
  dlg.showModal();
  ir(passo);
  return { fechar, passo: () => passo };
}

// Decide se o onboarding abre: app vazio e ainda não visto. Navegador automatizado (webdriver) não o vê, para não
// travar os testes das telas; o teste do onboarding força com fitrich-onboarding=forcar.
export async function talvezAbrir({ ctx, estado, aoFechar, carregar }) {
  const o = lerOnboarding();
  if (o === "feito") return;
  if (o !== "forcar" && o !== "idioma" && navigator.webdriver) return;
  if (["lancamentos", "pesos", "treinos", "contas", "cartoes", "metas", "dividas", "investimentos"].some((c) => estado[c].length)) { gravarOnboarding("feito"); return; }
  await carregar();
  abrirOnboarding(ctx, { comecarEm: o === "idioma" ? 2 : 1, aoFechar });
}
