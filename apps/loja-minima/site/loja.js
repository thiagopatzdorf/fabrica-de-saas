import { api, el, reais } from "./dom.js";

const CHAVE = "loja-carrinho";
const PAGINA = 48; // a loja tem centenas de produtos: desenhar todos de uma vez trava o celular
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let loja = { nome: "", whatsapp: "", frete_centavos: 0, frete_gratis_acima: null, aviso: "" };
let produtos = [];
let categoria = "";
let termo = "";
let visiveis = PAGINA;
let carrinho = [];
try { carrinho = JSON.parse(localStorage.getItem(CHAVE) || "[]"); } catch { carrinho = []; }
const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(carrinho)); } catch { /* sem armazenamento: o carrinho vale só nesta visita */ } };
const $ = (s) => document.querySelector(s);

const subtotal = () => carrinho.reduce((a, i) => a + (produtos.find((p) => p.id === i.id)?.preco ?? 0) * i.qtd, 0);
const frete = () => (loja.frete_gratis_acima !== null && subtotal() >= loja.frete_gratis_acima ? 0 : loja.frete_centavos);

function cartao(p) {
  return el("article", { class: "cartao" },
    el("button", { class: "cartao-foto", type: "button", "aria-label": `Ver ${p.nome}`, onclick: () => abrirProduto(p) },
      p.fotos[0] ? el("img", { src: p.fotos[0], alt: p.nome, loading: "lazy" }) : el("span", { class: "sem-foto", texto: "sem foto" }),
      !p.disponivel && el("span", { class: "selo", texto: "Esgotado" })),
    el("h3", { texto: p.nome }),
    el("p", { class: "preco" }, p.preco_antigo && el("s", { texto: reais(p.preco_antigo) }), " ", el("strong", { texto: reais(p.preco) })),
    p.preco >= 3000 && el("p", { class: "parcela", texto: "em até 12x no cartão" }));
}

function desenhar() {
  const cats = [...new Set(produtos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("#categorias").replaceChildren(...["", ...cats].map((c) => el("button", { type: "button", class: "chip", "aria-pressed": String(c === categoria), onclick: () => { categoria = c; visiveis = PAGINA; desenhar(); }, texto: c || "Tudo" })));
  const dest = produtos.filter((p) => p.destaque && (!categoria || p.categoria === categoria));
  $("#destaques-bloco").hidden = !dest.length;
  $("#destaques").replaceChildren(...dest.map(cartao));
  const t = norm(termo).trim();
  const lista = produtos.filter((p) => (!categoria || p.categoria === categoria) && (!t || norm(`${p.nome} ${p.categoria}`).includes(t)));
  $("#titulo-lista").textContent = t ? `${lista.length} resultado${lista.length === 1 ? "" : "s"} para “${termo.trim()}”` : categoria || "Produtos";
  $("#produtos").replaceChildren(...(lista.length ? lista.slice(0, visiveis).map(cartao) : [el("p", { class: "vazio", texto: t ? "Nada encontrado. Tente outra palavra." : "Nenhum produto por aqui ainda." })]));
  $("#mais").hidden = lista.length <= visiveis;
  $("#qtd-carrinho").textContent = String(carrinho.reduce((a, i) => a + i.qtd, 0));
}

function abrirProduto(p) {
  const dlg = $("#dlg-produto");
  const sel = p.variacoes.length ? el("select", { id: "var", "aria-label": "Tamanho" }, el("option", { value: "", texto: "Escolha o tamanho" }), p.variacoes.map((v) => el("option", { value: v, texto: v }))) : null;
  const qtd = el("input", { id: "qtd", type: "number", min: "1", max: "20", value: "1", "aria-label": "Quantidade" });
  const aviso = el("p", { class: "erro", role: "alert" });
  dlg.replaceChildren(
    el("button", { class: "fechar", type: "button", "aria-label": "Fechar", onclick: () => dlg.close(), texto: "×" }),
    p.fotos[0] && el("img", { class: "grande", src: p.fotos[0], alt: p.nome }),
    el("h2", { texto: p.nome }),
    el("p", { class: "preco" }, p.preco_antigo && el("s", { texto: reais(p.preco_antigo) }), " ", el("strong", { texto: reais(p.preco) })),
    p.descricao && el("p", { class: "desc", texto: p.descricao }),
    sel, qtd,
    el("button", { class: "primario", type: "button", disabled: !p.disponivel, texto: p.disponivel ? "Adicionar ao carrinho" : "Esgotado", onclick: () => {
      const variacao = sel ? sel.value : "";
      const n = Number(qtd.value);
      if (sel && !variacao) { aviso.textContent = "Escolha o tamanho."; return; }
      if (!Number.isInteger(n) || n < 1 || n > 20) { aviso.textContent = "Quantidade inválida."; return; }
      const j = carrinho.find((i) => i.id === p.id && i.variacao === variacao);
      if (j) j.qtd = Math.min(20, j.qtd + n); else carrinho.push({ id: p.id, variacao, qtd: n });
      salvar(); desenhar(); dlg.close(); abrirCarrinho();
    } }),
    aviso);
  dlg.showModal();
}

function campo(id, rotulo, extra = {}) {
  return el("label", { for: id }, rotulo, el("input", { id, name: id, ...extra }));
}

function abrirCarrinho() {
  const dlg = $("#dlg-carrinho");
  carrinho = carrinho.filter((i) => produtos.some((p) => p.id === i.id));
  salvar(); desenhar();
  if (!carrinho.length) {
    dlg.replaceChildren(el("button", { class: "fechar", type: "button", "aria-label": "Fechar", onclick: () => dlg.close(), texto: "×" }), el("h2", { texto: "Carrinho" }), el("p", { class: "vazio", texto: "Seu carrinho está vazio." }));
    dlg.showModal(); return;
  }
  const linhas = carrinho.map((i, idx) => {
    const p = produtos.find((x) => x.id === i.id);
    return el("li", { class: "linha" },
      el("span", { class: "nome", texto: `${p.nome}${i.variacao ? ` (${i.variacao})` : ""}` }),
      el("span", { class: "qtd" },
        el("button", { type: "button", "aria-label": "Menos um", onclick: () => { i.qtd -= 1; if (i.qtd < 1) carrinho.splice(idx, 1); abrirCarrinho(); }, texto: "−" }),
        ` ${i.qtd} `,
        el("button", { type: "button", "aria-label": "Mais um", onclick: () => { i.qtd = Math.min(20, i.qtd + 1); abrirCarrinho(); }, texto: "+" })),
      el("strong", { texto: reais(p.preco * i.qtd) }));
  });
  const erro = el("p", { class: "erro", role: "alert" });
  const form = el("form", { id: "form-compra", autocomplete: "on", novalidate: true },
    el("h3", { texto: "Seus dados" }),
    campo("nome", "Nome completo", { autocomplete: "name", required: true }),
    campo("whatsapp", "WhatsApp com DDD", { autocomplete: "tel", inputmode: "numeric", required: true }),
    campo("email", "E-mail (opcional)", { type: "email", autocomplete: "email" }),
    el("h3", { texto: "Entrega" }),
    campo("cep", "CEP", { autocomplete: "postal-code", inputmode: "numeric", required: true }),
    campo("rua", "Rua", { autocomplete: "address-line1", required: true }),
    campo("numero", "Número", { required: true }),
    campo("complemento", "Complemento"),
    campo("bairro", "Bairro"),
    campo("cidade", "Cidade", { autocomplete: "address-level2", required: true }),
    campo("uf", "UF", { maxlength: "2", autocomplete: "address-level1", required: true }),
    el("p", { class: "total" }, `Produtos ${reais(subtotal())} · Frete ${frete() ? reais(frete()) : "grátis"} · `, el("strong", { texto: `Total ${reais(subtotal() + frete())}` })),
    el("button", { class: "primario", type: "submit", texto: "Pagar (Pix ou cartão)" }), erro);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = (id) => form.elements[id].value.trim();
    const botao = form.querySelector("button[type=submit]");
    botao.disabled = true; erro.textContent = "";
    try {
      const r = await api("/api/pedido", { metodo: "POST", corpo: {
        itens: carrinho.map(({ id, variacao, qtd }) => ({ id, variacao, qtd })),
        cliente: { nome: v("nome"), whatsapp: v("whatsapp"), email: v("email") },
        entrega: { cep: v("cep"), rua: v("rua"), numero: v("numero"), complemento: v("complemento"), bairro: v("bairro"), cidade: v("cidade"), uf: v("uf") },
      } });
      carrinho = []; salvar();
      location.assign(r.url);
    } catch (e) { erro.textContent = e.message; botao.disabled = false; }
  });
  dlg.replaceChildren(el("button", { class: "fechar", type: "button", "aria-label": "Fechar", onclick: () => dlg.close(), texto: "×" }), el("h2", { texto: "Carrinho" }), el("ul", { class: "linhas" }, linhas), form);
  if (!dlg.open) dlg.showModal();
}

async function iniciar() {
  try {
    ({ loja, produtos } = await api("/api/loja"));
  } catch { $("#produtos").replaceChildren(el("p", { class: "erro", texto: "Não consegui carregar a loja. Tente de novo em instantes." })); return; }
  const av = $("#aviso"); av.hidden = !loja.aviso; av.textContent = loja.aviso;
  $("#qtd-produtos").textContent = String(produtos.filter((p) => p.disponivel).length);
  $("#mais").addEventListener("click", () => { visiveis += PAGINA; desenhar(); });
  $("#form-busca").addEventListener("submit", (ev) => ev.preventDefault());
  $("#busca").addEventListener("input", (ev) => { termo = ev.target.value; visiveis = PAGINA; desenhar(); if (termo.trim()) $("#catalogo").scrollIntoView({ block: "start" }); }); // o resultado não pode ficar escondido atrás do hero
  $("#abrir-carrinho").addEventListener("click", abrirCarrinho);
  desenhar();
}
iniciar();
