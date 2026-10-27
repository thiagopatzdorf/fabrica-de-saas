import { api, el, paraCentavos, reais } from "./dom.js";

const app = document.querySelector("#app");
const sair = document.querySelector("#sair");
let aba = "pedidos";

function entrada() {
  sair.hidden = true;
  const erro = el("p", { class: "erro", role: "alert" });
  const chave = el("input", { type: "password", autocomplete: "current-password", "aria-label": "Chave do painel", required: true });
  app.replaceChildren(el("form", { class: "form", onsubmit: async (ev) => {
    ev.preventDefault(); erro.textContent = "";
    try { await api("/api/admin/entrar", { metodo: "POST", corpo: { chave: chave.value } }); chave.value = ""; await painel(); } catch (e) { chave.value = ""; erro.textContent = e.message; }
  } }, el("h2", { texto: "Entrar" }), el("label", {}, "Chave do painel", chave), el("button", { class: "primario", type: "submit", texto: "Entrar" }), erro));
}

const abas = () => el("nav", { class: "chips", role: "tablist" }, [["pedidos", "Pedidos"], ["produtos", "Produtos"], ["loja", "Loja"]].map(([id, nome]) =>
  el("button", { class: "chip", type: "button", role: "tab", "aria-pressed": String(aba === id), onclick: () => { aba = id; painel(); }, texto: nome })));

async function painel() {
  sair.hidden = false;
  try {
    const corpo = aba === "pedidos" ? await telaPedidos() : aba === "produtos" ? await telaProdutos() : await telaLoja();
    app.replaceChildren(abas(), corpo);
  } catch (e) { if (e.status === 401) entrada(); else app.replaceChildren(el("p", { class: "erro", texto: e.message })); }
}

const ROTULO = { aguardando_pagamento: "Aguardando pagamento", pago: "Pago", enviado: "Enviado", cancelado: "Cancelado" };

async function telaPedidos() {
  const { pedidos } = await api("/api/admin/pedidos");
  if (!pedidos.length) return el("p", { class: "vazio", texto: "Nenhum pedido ainda." });
  return el("div", {}, pedidos.map((p) => el("article", { class: "pedido", "data-estado": p.estado },
    el("h3", { texto: `${ROTULO[p.estado]} · ${reais(p.total)} · ${new Date(p.criado).toLocaleString("pt-BR")}` }),
    el("ul", { class: "linhas" }, p.itens.map((i) => el("li", { class: "linha", texto: `${i.qtd} × ${i.nome}${i.variacao ? ` (${i.variacao})` : ""} — ${reais(i.preco * i.qtd)}` }))),
    el("p", { texto: `Frete ${p.frete ? reais(p.frete) : "grátis"}` }),
    el("p", {}, el("strong", { texto: p.cliente.nome }), ` · `, el("a", { class: "link", href: `https://wa.me/${p.cliente.whatsapp}`, target: "_blank", rel: "noopener noreferrer", texto: p.cliente.whatsapp }), p.cliente.email && ` · ${p.cliente.email}`),
    el("p", { texto: `${p.entrega.rua}, ${p.entrega.numero}${p.entrega.complemento ? ` ${p.entrega.complemento}` : ""} · ${p.entrega.bairro ? `${p.entrega.bairro} · ` : ""}${p.entrega.cidade}/${p.entrega.uf} · CEP ${p.entrega.cep}` }),
    p.rastreio && el("p", { texto: `Rastreio: ${p.rastreio}` }),
    ["pago", "aguardando_pagamento"].includes(p.estado) && el("p", { class: "acoes" },
      p.estado === "pago" && el("button", { class: "primario", type: "button", texto: "Marcar como enviado", onclick: async () => {
        const rastreio = prompt("Código de rastreio (pode deixar em branco):") ?? null;
        if (rastreio === null) return;
        try { await api(`/api/admin/pedidos/${p.id}`, { metodo: "POST", corpo: { estado: "enviado", rastreio } }); } catch (e) { alert(e.message); }
        painel();
      } }),
      el("button", { type: "button", texto: "Cancelar pedido", onclick: async () => {
        if (!confirm("Cancelar este pedido? O dinheiro, se já pago, é devolvido pelo provedor de pagamento, não por aqui.")) return;
        try { await api(`/api/admin/pedidos/${p.id}`, { metodo: "POST", corpo: { estado: "cancelado" } }); } catch (e) { alert(e.message); }
        painel();
      } })))));
}

function formProduto(p, aoSalvar) {
  const novo = !p;
  p = p || { id: "", nome: "", categoria: "", descricao: "", preco: 0, preco_antigo: null, fotos: [], estoque: null, variacoes: [], destaque: false, ativo: true };
  const f = {
    id: el("input", { value: p.id, disabled: !novo, placeholder: "camiseta-onda", required: true }),
    nome: el("input", { value: p.nome, required: true }),
    categoria: el("input", { value: p.categoria, placeholder: "Camisetas" }),
    preco: el("input", { value: p.preco ? (p.preco / 100).toFixed(2).replace(".", ",") : "", inputmode: "decimal", placeholder: "89,90", required: true }),
    antigo: el("input", { value: p.preco_antigo ? (p.preco_antigo / 100).toFixed(2).replace(".", ",") : "", inputmode: "decimal", placeholder: "(opcional) preço de antes" }),
    descricao: el("textarea", { rows: "3", texto: p.descricao }),
    fotos: el("textarea", { rows: "3", placeholder: "Um endereço https por linha", texto: p.fotos.join("\n") }),
    estoque: el("input", { value: p.estoque ?? "", inputmode: "numeric", placeholder: "(vazio = sem controle)" }),
    variacoes: el("input", { value: p.variacoes.join(", "), placeholder: "P, M, G (vazio = sem tamanho)" }),
    destaque: el("input", { type: "checkbox", checked: p.destaque }),
    ativo: el("input", { type: "checkbox", checked: p.ativo }),
  };
  const erro = el("p", { class: "erro", role: "alert" });
  return el("form", { class: "form", onsubmit: async (ev) => {
    ev.preventDefault(); erro.textContent = "";
    const preco = paraCentavos(f.preco.value);
    const antigo = f.antigo.value.trim() ? paraCentavos(f.antigo.value) : null;
    if (preco === null || (f.antigo.value.trim() && antigo === null)) { erro.textContent = "Preço inválido. Use o formato 89,90."; return; }
    const est = f.estoque.value.trim();
    if (est && !/^\d+$/.test(est)) { erro.textContent = "Estoque: só números."; return; }
    try {
      await api(`/api/admin/produtos/${encodeURIComponent(f.id.value.trim())}`, { metodo: "PUT", corpo: {
        nome: f.nome.value, categoria: f.categoria.value, descricao: f.descricao.value, preco, preco_antigo: antigo,
        fotos: f.fotos.value.split("\n").map((s) => s.trim()).filter(Boolean), estoque: est ? Number(est) : null,
        variacoes: f.variacoes.value.split(",").map((s) => s.trim()).filter(Boolean), destaque: f.destaque.checked, ativo: f.ativo.checked } });
      aoSalvar();
    } catch (e) { erro.textContent = e.message; }
  } },
  el("h3", { texto: novo ? "Novo produto" : `Editar ${p.nome}` }),
  el("label", {}, "Código (letras minúsculas, números e traço)", f.id), el("label", {}, "Nome", f.nome), el("label", {}, "Categoria", f.categoria),
  el("label", {}, "Preço (R$)", f.preco), el("label", {}, "Preço de antes (R$)", f.antigo), el("label", {}, "Descrição", f.descricao),
  el("label", {}, "Fotos", f.fotos), el("label", {}, "Estoque", f.estoque), el("label", {}, "Tamanhos", f.variacoes),
  el("label", { class: "linha-check" }, f.destaque, " Mostrar em Lançamentos"), el("label", { class: "linha-check" }, f.ativo, " À venda"),
  el("p", { class: "acoes" }, el("button", { class: "primario", type: "submit", texto: "Salvar" }), el("button", { type: "button", onclick: aoSalvar, texto: "Voltar" })), erro);
}

async function telaProdutos() {
  const { produtos } = await api("/api/admin/produtos");
  const lista = () => painel();
  return el("div", {},
    el("p", { class: "acoes" }, el("button", { class: "primario", type: "button", texto: "Novo produto", onclick: () => app.replaceChildren(abas(), formProduto(null, lista)) })),
    produtos.length ? el("ul", { class: "linhas" }, produtos.map((p) => el("li", { class: "linha" },
      el("span", { class: "nome", texto: `${p.nome}${p.ativo ? "" : " (oculto)"}` }),
      el("span", { texto: `${reais(p.preco)} · estoque ${p.estoque ?? "—"}` }),
      el("button", { type: "button", texto: "Editar", onclick: () => app.replaceChildren(abas(), formProduto(p, lista)) }),
      el("button", { type: "button", texto: "Apagar", onclick: async () => {
        if (!confirm(`Apagar ${p.nome} da loja? Pedidos antigos continuam registrados.`)) return;
        try { await api(`/api/admin/produtos/${p.id}`, { metodo: "DELETE" }); } catch (e) { alert(e.message); }
        painel();
      } })))) : el("p", { class: "vazio", texto: "Nenhum produto cadastrado." }));
}

async function telaLoja() {
  const { config: c } = await api("/api/admin/config");
  const f = {
    nome: el("input", { value: c.nome, required: true }),
    whatsapp: el("input", { value: c.whatsapp, inputmode: "numeric", placeholder: "5547999999999" }),
    frete: el("input", { value: (c.frete_centavos / 100).toFixed(2).replace(".", ","), inputmode: "decimal" }),
    gratis: el("input", { value: c.frete_gratis_acima === null ? "" : (c.frete_gratis_acima / 100).toFixed(2).replace(".", ","), inputmode: "decimal", placeholder: "(vazio = nunca)" }),
    aviso: el("input", { value: c.aviso, placeholder: "Ex.: Frete grátis acima de R$ 300" }),
  };
  const msg = el("p", { role: "status" });
  return el("form", { class: "form", onsubmit: async (ev) => {
    ev.preventDefault(); msg.className = "erro"; msg.textContent = "";
    const frete = paraCentavos(f.frete.value || "0");
    const gratis = f.gratis.value.trim() ? paraCentavos(f.gratis.value) : null;
    if (frete === null || (f.gratis.value.trim() && gratis === null)) { msg.textContent = "Valor inválido. Use o formato 15,00."; return; }
    try { await api("/api/admin/config", { metodo: "PUT", corpo: { nome: f.nome.value, whatsapp: f.whatsapp.value, frete_centavos: frete, frete_gratis_acima: gratis, aviso: f.aviso.value } }); msg.className = "ok"; msg.textContent = "Salvo."; } catch (e) { msg.textContent = e.message; }
  } },
  el("h3", { texto: "Dados da loja" }), el("label", {}, "Nome da loja", f.nome), el("label", {}, "WhatsApp da loja (com 55 e DDD)", f.whatsapp),
  el("label", {}, "Frete (R$)", f.frete), el("label", {}, "Frete grátis a partir de (R$)", f.gratis), el("label", {}, "Aviso no topo", f.aviso),
  el("button", { class: "primario", type: "submit", texto: "Salvar" }), msg);
}

sair.addEventListener("click", async () => { try { await api("/api/admin/sair", { metodo: "POST", corpo: {} }); } catch { /* já saiu */ } entrada(); });
painel();
