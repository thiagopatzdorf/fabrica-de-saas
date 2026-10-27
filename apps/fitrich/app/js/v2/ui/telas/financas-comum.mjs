// Peças que as telas Finanças e Cartões dividem (uma tela não importa a outra, então o que é comum às duas
// vive aqui): leitura de dinheiro digitado, nome de categoria traduzido, figura com tabela-irmã e leitura
// por toque, diálogo acessível no lugar da caixa nativa de confirmação. Nada aqui toca o armazenamento nem o relógio.
import { CATEGORIAS_PADRAO, SEM_CATEGORIA } from "../../esquema.mjs";

// "1.234,56", "1234,56", "1,234.56", "R$ 12", "12,5", "$12.50" → centavos inteiros; null se não for dinheiro.
// Com os dois separadores, o ÚLTIMO é o decimal (serve para pt-BR e en); com um só, duas casas = decimal.
export function lerCentavos(texto) {
  let s = String(texto ?? "").replace(/[R$€\s]/g, "");
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const v = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (v >= 0 && p >= 0) s = v > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (v >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return Number.isSafeInteger(c) && c > 0 ? c : null;
}

// Centavos → texto editável no idioma (sem símbolo): 123456 → "1234,56" (pt-BR) ou "1234.56" (en).
export const centavosParaCampo = (centavos, idioma) => (centavos / 100).toFixed(2).replace(".", idioma === "en" ? "." : ",");

const NOME_PADRAO = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c.nome]));
// Categoria padrão que a pessoa NÃO renomeou sai traduzida (`<prefixo>.cat.cat-mercado` → "Groceries");
// categoria criada ou renomeada é dado da pessoa e sai como está. Sem categoria tem chave própria.
export function nomeCategoria(categorias, categoriaId, t, prefixo) {
  if (categoriaId == null || categoriaId === SEM_CATEGORIA) return t(`${prefixo}.sem_categoria`);
  const c = categorias.find((x) => x.id === categoriaId);
  if (!c) return t(`${prefixo}.categoria_removida`);
  return NOME_PADRAO.get(c.id) === c.nome ? t(`${prefixo}.cat.${c.id}`) : c.nome;
}

// Um id por chamada para `aria-labelledby`/`for` dentro de uma tela (a mesma tela pode montar duas vezes).
let seq = 0;
export const idUnico = (base) => `${base}-${(seq += 1).toString(36)}`;

// Figura = gráfico + leitura por toque/foco (texto, nunca posicionamento) + tabela-irmã em <details>.
// O `.hit` do gráfico carrega `data-tip`; a leitura mostra esse texto, então quem não vê a cor lê o número.
export function figura(h, { grafico, leitura, tabela, rotuloTabela, classe = "" }) {
  const saida = h("p", { class: "fin-leitura", "aria-live": "off" }, leitura ?? "");
  const fig = h("figure", { class: ["fin-figura", classe] }, h("div", { class: "fin-graf" }, grafico), saida);
  const mostrar = (e) => { const hit = e.target.closest?.(".hit"); if (hit?.dataset.tip) saida.textContent = hit.dataset.tip; };
  fig.addEventListener("pointerover", mostrar);
  fig.addEventListener("focusin", mostrar);
  if (tabela) fig.append(h("details", { class: "fin-tabela" }, h("summary", null, rotuloTabela), h("div", { class: "fin-rolar" }, tabelaDe(h, tabela))));
  return fig;
}

export function tabelaDe(h, { cabecalho, linhas }) {
  return h("table", null,
    h("thead", null, h("tr", null, cabecalho.map((c) => h("th", { scope: "col" }, c)))),
    h("tbody", null, linhas.map((l) => h("tr", null, l.map((c, i) => h(i === 0 ? "th" : "td", i === 0 ? { scope: "row" } : null, c))))));
}

// Diálogo modal com formulário: devolve `{ dialogo, abrir(), fechar() }`. O conteúdo é montado por `corpo(form)`
// a cada abertura; `aoEnviar(form)` devolve uma promessa — erro vira texto no `aria-live` do próprio diálogo.
export function dialogoFormulario(h, { titulo, rotuloSalvar, rotuloCancelar, corpo, aoEnviar, classe = "" }) {
  const idT = idUnico("dlg");
  const erro = h("p", { class: "fin-erro", role: "alert" });
  const form = h("form", { method: "dialog", class: "fin-form", novalidate: true });
  const dialogo = h("dialog", { class: ["fin-dialogo", classe], "aria-labelledby": idT },
    h("h3", { id: idT }, titulo), form, erro);
  const fechar = () => { if (dialogo.open) dialogo.close(); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.textContent = "";
    try { await aoEnviar(form); fechar(); } catch (x) { erro.textContent = typeof x === "string" ? x : x?.mensagem ?? x?.message ?? String(x); }
  });
  dialogo.addEventListener("click", (e) => { if (e.target === dialogo) fechar(); }); // toque fora fecha
  return {
    dialogo, fechar,
    abrir() {
      while (form.firstChild) form.removeChild(form.firstChild);
      erro.textContent = "";
      form.append(corpo(form), h("div", { class: "fin-acoes-dlg" },
        h("button", { type: "button", class: "fin-btn fin-btn-sec", onClick: fechar }, rotuloCancelar),
        h("button", { type: "submit", class: "fin-btn" }, rotuloSalvar)));
      if (typeof dialogo.showModal === "function") dialogo.showModal(); else dialogo.setAttribute("open", "");
      form.querySelector("input,select,textarea")?.focus();
    },
  };
}

// <label>texto <input|select></label>: todo campo tem rótulo visível (WCAG) e id para o teste achar.
export const campo = (h, rotulo, controle, extra = null) => h("label", { class: "fin-campo" }, h("span", null, rotulo), controle, extra);
export const opcoes = (h, lista, selecionado) => lista.map(([valor, texto]) => h("option", { value: valor, selected: valor === selecionado }, texto));

// Texto do erro do esquema para a pessoa: um código conhecido vira frase; o resto mostra o código mesmo
// (melhor que "erro desconhecido": a pessoa consegue relatar).
export function textoDoErro(e, t, prefixo) {
  const codigos = e?.erros?.map((x) => x.codigo ?? x) ?? [];
  const conhecido = codigos.find((c) => CODIGOS_COM_TEXTO.has(c));
  return conhecido ? t(`${prefixo}.erro.${conhecido}`) : t(`${prefixo}.erro.generico`, { codigo: codigos[0] ?? e?.message ?? "?" });
}
export const CODIGOS_COM_TEXTO = new Set(["lancamento.valor_invalido", "lancamento.data_invalida", "lancamento.sem_categoria", "lancamentos.em_uso", "lancamento.estorno_maior_que_compra", "cartoes.em_uso", "cartao.conta_pagamento_inexistente", "lancamento.categoria_tipo_divergente"]);
