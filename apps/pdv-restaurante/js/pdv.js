// Tela do PDV (pdv.html). A conta é toda do motor.mjs; aqui fica estado, desenho e
// eventos. O estado mora no localStorage deste aparelho: nada sai daqui (a CSP tem
// connect-src 'none'). Todo texto digitado passa por esc() antes de virar HTML.
import * as m from "./motor.mjs";

const CHAVE = "pdv-restaurante-v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const hora = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataHora = (t) => new Date(t).toLocaleString("pt-BR");

function estadoNovo() {
  return {
    v: 1,
    cfg: { nome: "Restaurante Exemplo", cnpj: "11.222.333/0001-81", ie: "", uf: "RS", endereco: "Rua Exemplo, 100 · Centro",
      mesas: 12, servicoPct: 10, tributosPct: 13.45 },
    cardapio: structuredClone(m.CARDAPIO_EXEMPLO),
    comandas: {},
    cozinha: [],
    vendas: [],
    caixa: { aberto: false, fundo: 0, movs: [], abertoEm: null },
    fechamentos: [],
    seq: { pedido: 0, nfce: 0 },
  };
}

function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (s && s.v === 1) return s;
  } catch { /* aba anônima ou dado corrompido: começa do zero em vez de quebrar a tela */ }
  return estadoNovo();
}
let E = carregar();
function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(E)); } catch { /* sem armazenamento: segue em memória */ }
}

// ---------------------------------------------------------------- abas
function abrirAba(nome) {
  for (const b of document.querySelectorAll('[role="tab"]')) {
    const sel = b.dataset.aba === nome;
    b.setAttribute("aria-selected", String(sel));
    b.tabIndex = sel ? 0 : -1;
    $(b.getAttribute("aria-controls")).hidden = !sel;
  }
  desenhar();
}
document.querySelector(".abas").addEventListener("keydown", (ev) => {
  if (!["ArrowLeft", "ArrowRight"].includes(ev.key)) return;
  const abas = [...document.querySelectorAll('[role="tab"]')];
  const i = abas.indexOf(document.activeElement);
  if (i < 0) return;
  const prox = abas[(i + (ev.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
  prox.focus();
  abrirAba(prox.dataset.aba);
});

// ---------------------------------------------------------------- comandas
let atual = null; // id da comanda aberta no diálogo
let catAtual = "Todos";

function comandaDaMesa(n) {
  return Object.values(E.comandas).find((c) => c.tipo === "mesa" && c.mesa === n);
}
function novaComanda(tipo, mesa) {
  E.seq.pedido += 1;
  const c = { id: uid(), tipo, mesa: mesa ?? null, numero: E.seq.pedido, itens: [], servico: tipo === "mesa",
    desconto: null, entrega: tipo === "delivery" ? 700 : 0, cliente: "", telefone: "", endereco: "", criada: Date.now() };
  E.comandas[c.id] = c;
  salvar();
  return c;
}
function tituloComanda(c) {
  if (c.tipo === "mesa") return `Mesa ${c.mesa}`;
  if (c.tipo === "delivery") return `Delivery #${c.numero}`;
  return `Balcão #${c.numero}`;
}
function abrirComanda(id) {
  atual = id;
  $("busca").value = "";
  $("erro-comanda").textContent = "";
  desenharComanda();
  abrirDlg("dlg-comanda");
}

function desenharMenu() {
  const termo = $("busca").value.trim().toLowerCase();
  const cats = ["Todos", ...E.cardapio.categorias];
  $("chips").innerHTML = cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === catAtual}">${esc(c)}</button>`).join("");
  const itens = E.cardapio.itens.filter((i) => (catAtual === "Todos" || i.cat === catAtual) && (!termo || i.nome.toLowerCase().includes(termo)));
  $("itens-menu").innerHTML = itens.length
    ? itens.map((i) => `<button type="button" class="item" data-add="${esc(i.id)}"><span>${esc(i.nome)}</span><b>${m.brl(i.preco)}</b></button>`).join("")
    : '<p class="vazio">Nada com esse nome no cardápio.</p>';
}

function desenharComanda() {
  const c = E.comandas[atual];
  if (!c) return;
  $("cmd-titulo").textContent = tituloComanda(c);
  $("cmd-cliente").innerHTML = c.tipo === "mesa" ? "" : `
    <div class="cliente">
      <label>Cliente<input data-campo="cliente" value="${esc(c.cliente)}" maxlength="60" autocomplete="off"></label>
      <label>Telefone<input data-campo="telefone" value="${esc(c.telefone)}" inputmode="tel" maxlength="20" autocomplete="off"></label>
      ${c.tipo === "delivery" ? `<label class="larga">Endereço de entrega<input data-campo="endereco" value="${esc(c.endereco)}" maxlength="140" autocomplete="off"></label>
      <label>Taxa de entrega<input data-campo="entrega" value="${esc(m.brl(c.entrega).replace("R$ ", ""))}" inputmode="decimal" autocomplete="off"></label>` : ""}
    </div>`;
  $("linhas").innerHTML = c.itens.length ? c.itens.map((i) => `
    <li>
      <div class="ln-nome"><b>${esc(i.nome)}</b>${i.enviado ? `<small class="enviado">${i.enviado} na cozinha</small>` : ""}
        <input class="obs" data-obs="${esc(i.uid)}" value="${esc(i.obs || "")}" placeholder="observação" maxlength="60" aria-label="Observação de ${esc(i.nome)}" autocomplete="off"></div>
      <div class="qtd">
        <button type="button" class="ib" data-menos="${esc(i.uid)}" aria-label="Menos ${esc(i.nome)}">−</button>
        <span aria-label="quantidade">${i.qtd}</span>
        <button type="button" class="ib" data-mais="${esc(i.uid)}" aria-label="Mais ${esc(i.nome)}">+</button>
      </div>
      <b class="ln-v">${m.brl(i.preco * i.qtd)}</b>
    </li>`).join("") : '<li class="vazio">Toque nos itens do cardápio para lançar.</li>';
  $("chk-servico").checked = !!c.servico;
  $("chk-servico").closest("label").lastChild.textContent = ` Taxa de serviço (${E.cfg.servicoPct}%)`;
  $("inp-desconto").value = c.desconto ? (c.desconto.tipo === "pct" ? `${c.desconto.v}%` : m.brl(c.desconto.v).replace("R$ ", "")) : "";
  desenharTotais(c);
  desenharMenu();
}

function desenharTotais(c) {
  const t = m.totais(c, E.cfg);
  $("cmd-totais").innerHTML = `
    <dt>Subtotal</dt><dd>${m.brl(t.subtotal)}</dd>
    ${t.desconto ? `<dt>Desconto</dt><dd>−${m.brl(t.desconto)}</dd>` : ""}
    ${t.servico ? `<dt>Serviço</dt><dd>${m.brl(t.servico)}</dd>` : ""}
    ${t.entrega ? `<dt>Entrega</dt><dd>${m.brl(t.entrega)}</dd>` : ""}
    <dt class="t">Total</dt><dd class="t">${m.brl(t.total)}</dd>`;
}

function lancar(itemId) {
  const c = E.comandas[atual];
  const it = E.cardapio.itens.find((i) => i.id === itemId);
  if (!c || !it) return;
  // Mesmo item sem observação soma na linha; com observação diferente vira outra linha.
  const linha = c.itens.find((i) => i.itemId === it.id && !i.obs);
  if (linha) linha.qtd += 1;
  else c.itens.push({ uid: uid(), itemId: it.id, nome: it.nome, preco: it.preco, qtd: 1, ncm: it.ncm, cfop: it.cfop,
    cozinha: it.cozinha !== false, enviado: 0, obs: "" });
  salvar();
  desenharComanda();
}

function mudarQtd(lid, delta) {
  const c = E.comandas[atual];
  const l = c.itens.find((i) => i.uid === lid);
  if (!l) return;
  const nova = l.qtd + delta;
  if (nova < (l.enviado || 0)) {
    $("erro-comanda").textContent = "Esse item já foi para a cozinha. Cancele na cozinha antes de tirar da conta.";
    return;
  }
  $("erro-comanda").textContent = "";
  if (nova <= 0) c.itens = c.itens.filter((i) => i.uid !== lid);
  else l.qtd = nova;
  salvar();
  desenharComanda();
}

function mandarCozinha() {
  const c = E.comandas[atual];
  const pend = m.pendentesCozinha(c);
  if (!pend.length) { $("erro-comanda").textContent = "Nada novo para mandar para a cozinha."; return; }
  for (const p of pend) {
    E.cozinha.push({ id: uid(), comanda: c.id, origem: tituloComanda(c), nome: p.nome, qtd: p.qtd, obs: p.obs, status: "fila", t: Date.now() });
    const l = c.itens.find((i) => i.uid === p.uid);
    l.enviado = (l.enviado || 0) + p.qtd;
  }
  $("erro-comanda").textContent = "";
  salvar();
  desenharComanda();
  desenharContador();
}

// ---------------------------------------------------------------- pagamento
let pgForma = "dinheiro";
let pgs = [];

function abrirPagamento() {
  const c = E.comandas[atual];
  if (!c.itens.length) { $("erro-comanda").textContent = "A comanda está vazia."; return; }
  if (!E.caixa.aberto) { $("erro-comanda").textContent = "Abra o caixa (aba Caixa) antes de receber."; return; }
  pgs = [];
  pgForma = "dinheiro";
  $("pg-doc").value = "";
  $("pg-dividir").value = "1";
  $("erro-pg").textContent = "";
  fecharDlg("dlg-comanda");
  desenharPagamento();
  abrirDlg("dlg-pagar");
}

function desenharPagamento() {
  const c = E.comandas[atual];
  const t = m.totais(c, E.cfg);
  const r = m.conferirPagamentos(t.total, pgs);
  $("pg-titulo").textContent = `Pagamento · ${tituloComanda(c)}`;
  $("pg-resumo").innerHTML = `<dt class="t">Total</dt><dd class="t">${m.brl(t.total)}</dd>
    <dt>Pago</dt><dd>${m.brl(r.ok ? r.pago : 0)}</dd>
    <dt>Falta</dt><dd>${m.brl(r.ok ? r.falta : t.total)}</dd>
    ${r.ok && r.troco ? `<dt class="troco">Troco</dt><dd class="troco">${m.brl(r.troco)}</dd>` : ""}`;
  $("formas").innerHTML = Object.entries(m.FORMAS).map(([k, v]) =>
    `<button type="button" class="chip" data-forma="${k}" aria-pressed="${k === pgForma}">${esc(v)}</button>`).join("");
  const falta = r.ok ? r.falta : t.total;
  $("pg-valor").value = falta ? m.brl(falta).replace("R$ ", "") : "";
  const n = Number($("pg-dividir").value) || 1;
  $("pg-partes").textContent = n > 1 ? m.dividir(t.total, n).map(m.brl).join(" · ") : "";
  $("pg-lista").innerHTML = pgs.map((p, i) => `<li><span>${esc(m.FORMAS[p.forma])}</span><b>${m.brl(p.valor)}</b>
    <button type="button" class="ib" data-tirar-pg="${i}" aria-label="Tirar pagamento">×</button></li>`).join("");
  $("btn-finalizar").disabled = !(r.ok && r.quitado);
}

function lancarPagamento() {
  const v = m.lerValor($("pg-valor").value);
  if (!v) { $("erro-pg").textContent = "Digite um valor, como 25,90."; return; }
  const c = E.comandas[atual];
  const t = m.totais(c, E.cfg);
  const teste = m.conferirPagamentos(t.total, [...pgs, { forma: pgForma, valor: v }]);
  if (!teste.ok) { $("erro-pg").textContent = teste.erro; return; }
  $("erro-pg").textContent = "";
  pgs.push({ forma: pgForma, valor: v });
  desenharPagamento();
}

function finalizar() {
  const c = E.comandas[atual];
  const t = m.totais(c, E.cfg);
  const r = m.conferirPagamentos(t.total, pgs);
  if (!r.ok || !r.quitado) return;
  const doc = $("pg-doc").value.replace(/\D/g, "");
  if (doc && !(doc.length === 11 ? m.cpfValido(doc) : m.cnpjValido(doc))) {
    $("erro-pg").textContent = "CPF ou CNPJ não confere. Corrija ou deixe em branco.";
    return;
  }
  const venda = { id: uid(), comanda: c.id, tipo: c.tipo, titulo: tituloComanda(c), quando: Date.now(),
    itens: c.itens.map(({ nome, preco, qtd, ncm, cfop }) => ({ nome, preco, qtd, ncm, cfop })),
    ...t, pagamentos: pgs, troco: r.troco, doc, cliente: c.cliente, endereco: c.endereco, nfce: null };
  if ($("pg-nfce").checked) {
    if (!m.cnpjValido(E.cfg.cnpj)) { $("erro-pg").textContent = "Cadastre um CNPJ válido em Ajustes para emitir a nota."; return; }
    E.seq.nfce += 1;
    const codigo = Math.floor(Math.random() * 1e8);
    venda.nfce = { numero: E.seq.nfce, serie: 1, chave: m.chaveAcesso({ uf: E.cfg.uf, data: new Date(venda.quando), cnpj: E.cfg.cnpj,
      serie: 1, numero: E.seq.nfce, codigo }), tributos: m.tributosAproximados(venda.itens, E.cfg.tributosPct) };
  }
  E.vendas.push(venda);
  E.cozinha = E.cozinha.filter((k) => k.comanda !== c.id || k.status !== "entregue");
  delete E.comandas[c.id];
  salvar();
  fecharDlg("dlg-pagar");
  $("impressao").innerHTML = cupom(venda);
  abrirDlg("dlg-cupom");
  desenhar();
}

// Cupom no formato da bobina de 80 mm. Com NFC-e, o leiaute segue o DANFE NFC-e; na
// demonstração ele diz em letras grandes que não tem valor fiscal (nunca fingir emissão).
function cupom(v) {
  const cfg = E.cfg;
  const linhas = v.itens.map((i, n) => `<tr><td>${String(n + 1).padStart(3, "0")}</td><td>${esc(i.nome)}<br><small>${i.qtd} x ${m.brl(i.preco)}</small></td><td class="r">${m.brl(i.preco * i.qtd)}</td></tr>`).join("");
  const pags = v.pagamentos.map((p) => `<tr><td colspan="2">${esc(m.FORMAS[p.forma])}</td><td class="r">${m.brl(p.valor)}</td></tr>`).join("");
  const cab = `<p class="c"><b>${esc(cfg.nome)}</b><br>CNPJ ${esc(cfg.cnpj)}${cfg.ie ? ` · IE ${esc(cfg.ie)}` : ""}<br>${esc(cfg.endereco)}</p>`;
  const corpo = `<table><thead><tr><th>#</th><th>Item</th><th class="r">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
    <table class="tt"><tr><td colspan="2">Qtde. total de itens</td><td class="r">${v.itens.reduce((a, i) => a + i.qtd, 0)}</td></tr>
    <tr><td colspan="2">Subtotal</td><td class="r">${m.brl(v.subtotal)}</td></tr>
    ${v.desconto ? `<tr><td colspan="2">Desconto</td><td class="r">−${m.brl(v.desconto)}</td></tr>` : ""}
    ${v.servico ? `<tr><td colspan="2">Taxa de serviço</td><td class="r">${m.brl(v.servico)}</td></tr>` : ""}
    ${v.entrega ? `<tr><td colspan="2">Entrega</td><td class="r">${m.brl(v.entrega)}</td></tr>` : ""}
    <tr class="t"><td colspan="2">Valor a pagar</td><td class="r">${m.brl(v.total)}</td></tr>
    <tr><td colspan="3"><b>Forma de pagamento</b></td></tr>${pags}
    ${v.troco ? `<tr><td colspan="2">Troco</td><td class="r">${m.brl(v.troco)}</td></tr>` : ""}</table>`;
  const doc = v.doc.length === 11 ? v.doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : v.doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  const consumidor = v.doc ? `${v.doc.length === 11 ? "CPF" : "CNPJ"} do consumidor: ${esc(doc)}` : "Consumidor não identificado";
  if (!v.nfce) {
    return `${cab}<p class="c"><b>CUPOM NÃO FISCAL</b><br>${esc(v.titulo)} · ${dataHora(v.quando)}</p>${corpo}<p class="c">${consumidor}</p>`;
  }
  return `<p class="demo">DEMONSTRAÇÃO · SEM VALOR FISCAL</p>${cab}
    <p class="c"><b>Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</b></p>${corpo}
    <p class="c">Tributos totais incidentes (Lei Federal 12.741/2012), aproximados: ${m.brl(v.nfce.tributos)}</p>
    <p class="c">NFC-e nº ${String(v.nfce.numero).padStart(9, "0")} · Série ${String(v.nfce.serie).padStart(3, "0")} · ${dataHora(v.quando)}<br>
    Consulte pela chave de acesso no portal da SEFAZ-${esc(cfg.uf)}</p>
    <p class="c chave">${m.chaveEmBlocos(v.nfce.chave)}</p>
    <p class="c">${consumidor}</p>
    <p class="c">Na nota autorizada aparecem aqui o protocolo de autorização e o QR Code de consulta. Esta prévia não foi enviada à SEFAZ.</p>`;
}

// ---------------------------------------------------------------- telas
function desenharSalao() {
  const n = Math.max(1, Math.min(99, Number(E.cfg.mesas) || 12));
  let h = "";
  for (let i = 1; i <= n; i++) {
    const c = comandaDaMesa(i);
    const t = c ? m.totais(c, E.cfg).total : 0;
    h += `<button type="button" class="mesa${c ? " ocupada" : ""}" data-mesa="${i}" aria-label="Mesa ${i}${c ? `, ocupada, ${m.brl(t)}` : ", livre"}">
      <b>${i}</b><span>${c ? m.brl(t) : "livre"}</span>${c ? `<small>desde ${hora(c.criada)}</small>` : ""}</button>`;
  }
  $("mesas").innerHTML = h;
}

function desenharBalcao() {
  const abertos = Object.values(E.comandas).filter((c) => c.tipo !== "mesa").sort((a, b) => a.criada - b.criada);
  $("pedidos-abertos").innerHTML = abertos.length ? abertos.map((c) => `<li><button type="button" class="pedido" data-comanda="${esc(c.id)}">
      <b>${esc(tituloComanda(c))}</b><span>${esc(c.cliente || (c.tipo === "delivery" ? "sem nome" : ""))}</span>
      <span>${m.brl(m.totais(c, E.cfg).total)}</span><small>${hora(c.criada)}</small></button></li>`).join("")
    : '<li class="vazio">Nenhum pedido aberto.</li>';
}

const ROTULO_KDS = { fila: "Na fila", preparo: "Em preparo", pronto: "Pronto" };
function desenharCozinha() {
  const vivos = E.cozinha.filter((k) => k.status !== "entregue");
  $("kds").innerHTML = ["fila", "preparo", "pronto"].map((st) => `<div class="col"><h3>${ROTULO_KDS[st]} <span>${vivos.filter((k) => k.status === st).length}</span></h3>
    ${vivos.filter((k) => k.status === st).map((k) => `<article class="tk ${st}"><header><b>${esc(k.origem)}</b><small>${hora(k.t)}</small></header>
      <p><b>${k.qtd}×</b> ${esc(k.nome)}</p>${k.obs ? `<p class="obs-k">${esc(k.obs)}</p>` : ""}
      <button type="button" class="bt" data-kds="${esc(k.id)}">${st === "fila" ? "Começar" : st === "preparo" ? "Pronto" : "Entregue"}</button></article>`).join("") || '<p class="vazio">Vazio.</p>'}</div>`).join("");
}
function desenharContador() {
  const n = E.cozinha.filter((k) => k.status === "fila" || k.status === "preparo").length;
  $("cont-cozinha").textContent = n ? String(n) : "";
}

function vendasDoCaixa() {
  return E.caixa.aberto ? E.vendas.filter((v) => v.quando >= E.caixa.abertoEm) : [];
}
function desenharCaixa() {
  const st = $("caixa-st");
  st.textContent = E.caixa.aberto ? `Caixa aberto desde ${hora(E.caixa.abertoEm)}` : "Caixa fechado";
  st.classList.toggle("aberto", E.caixa.aberto);
  if (!E.caixa.aberto) {
    const ult = E.fechamentos.at(-1);
    $("caixa").innerHTML = `<form class="form-caixa" id="form-abrir" novalidate>
      <label>Fundo de troco<input name="fundo" inputmode="decimal" placeholder="200,00" autocomplete="off"></label>
      <button class="bt p" type="submit">Abrir caixa</button><p class="erro" role="alert" id="erro-caixa"></p></form>
      ${ult ? `<div class="cartao"><h3>Último fechamento · ${dataHora(ult.em)}</h3><dl class="tot">
        <dt>Vendido</dt><dd>${m.brl(ult.vendido)}</dd><dt>Dinheiro esperado</dt><dd>${m.brl(ult.esperado)}</dd>
        <dt>Dinheiro contado</dt><dd>${m.brl(ult.contado)}</dd>
        <dt class="${ult.diferenca ? "dif" : ""}">Diferença</dt><dd class="${ult.diferenca ? "dif" : ""}">${m.brl(ult.diferenca)}</dd></dl></div>` : ""}`;
    return;
  }
  const r = m.resumoCaixa(E.caixa, vendasDoCaixa());
  $("caixa").innerHTML = `<div class="grade-caixa">
    <div class="cartao"><h3>Resumo</h3><dl class="tot">
      <dt>Fundo de troco</dt><dd>${m.brl(r.fundo)}</dd>
      ${Object.entries(m.FORMAS).map(([k, v]) => `<dt>${esc(v)}</dt><dd>${m.brl(r.porForma[k])}</dd>`).join("")}
      <dt>Troco dado</dt><dd>−${m.brl(r.troco)}</dd>
      <dt>Suprimentos</dt><dd>${m.brl(r.suprimentos)}</dd><dt>Sangrias</dt><dd>−${m.brl(r.sangrias)}</dd>
      <dt class="t">Dinheiro na gaveta</dt><dd class="t">${m.brl(r.esperadoDinheiro)}</dd>
      <dt>Total vendido</dt><dd>${m.brl(r.vendido)}</dd></dl></div>
    <div class="cartao"><h3>Movimentar</h3>
      <form class="form-caixa" id="form-mov" novalidate>
        <label>Valor<input name="valor" inputmode="decimal" autocomplete="off"></label>
        <label>Motivo<input name="motivo" maxlength="60" autocomplete="off"></label>
        <div class="acoes-l"><button class="bt" type="submit" value="sangria">Sangria</button><button class="bt" type="submit" value="suprimento">Suprimento</button></div>
        <p class="erro" role="alert" id="erro-mov"></p></form>
      <ul class="movs">${E.caixa.movs.map((mv) => `<li>${hora(mv.t)} · ${mv.tipo === "sangria" ? "Sangria" : "Suprimento"} ${m.brl(mv.valor)}${mv.motivo ? ` · ${esc(mv.motivo)}` : ""}</li>`).join("")}</ul></div>
    <div class="cartao"><h3>Fechar caixa</h3>
      <form class="form-caixa" id="form-fechar" novalidate>
        <label>Dinheiro contado na gaveta<input name="contado" inputmode="decimal" autocomplete="off"></label>
        <button class="bt p" type="submit">Fechar caixa</button>
        <p class="erro" role="alert" id="erro-fechar"></p></form>
      <p class="dica">${Object.keys(E.comandas).length} comanda(s) aberta(s) continuam abertas depois do fechamento.</p></div></div>`;
}

function desenharRelatorio() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const vendas = E.vendas.filter((v) => v.quando >= hoje.getTime());
  const r = m.relatorio(vendas);
  $("relatorio").innerHTML = `<div class="kpis">
      <div><span>Vendas hoje</span><b>${m.brl(r.total)}</b></div>
      <div><span>Pedidos</span><b>${r.n}</b></div>
      <div><span>Ticket médio</span><b>${m.brl(r.ticketMedio)}</b></div>
      <div><span>Taxa de serviço</span><b>${m.brl(r.servico)}</b></div>
    </div>
    <div class="grade-caixa">
      <div class="cartao"><h3>Por canal</h3><dl class="tot"><dt>Salão</dt><dd>${m.brl(r.porTipo.mesa)}</dd>
        <dt>Balcão</dt><dd>${m.brl(r.porTipo.balcao)}</dd><dt>Delivery</dt><dd>${m.brl(r.porTipo.delivery)}</dd>
        <dt>Notas (prévias) emitidas</dt><dd>${r.notas}</dd></dl></div>
      <div class="cartao"><h3>Mais vendidos</h3>${r.maisVendidos.length ? `<ol class="top">${r.maisVendidos.map((i) => `<li><span>${esc(i.nome)}</span><b>${i.qtd}</b><small>${m.brl(i.valor)}</small></li>`).join("")}</ol>` : '<p class="vazio">Sem vendas hoje.</p>'}</div>
    </div>
    <h3>Vendas de hoje</h3>
    <div class="tabela-rola"><table class="tabela"><thead><tr><th>Hora</th><th>Pedido</th><th>Pagamento</th><th class="r">Total</th><th>Nota</th><th></th></tr></thead><tbody>
    ${vendas.slice().reverse().map((v) => `<tr><td>${hora(v.quando)}</td><td>${esc(v.titulo)}</td><td>${esc(v.pagamentos.map((p) => m.FORMAS[p.forma]).join(" + "))}</td>
      <td class="r">${m.brl(v.total)}</td><td>${v.nfce ? `NFC-e ${v.nfce.numero}` : "—"}</td><td><button type="button" class="bt mini" data-revenda="${esc(v.id)}">Ver cupom</button></td></tr>`).join("") || '<tr><td colspan="6" class="vazio">Sem vendas hoje.</td></tr>'}
    </tbody></table></div>`;
}

function desenharCardapio() {
  $("cats").innerHTML = E.cardapio.categorias.map((c) => `<option value="${esc(c)}">`).join("");
  $("tabela-cardapio").innerHTML = `<thead><tr><th>Item</th><th>Categoria</th><th class="r">Preço</th><th>NCM</th><th>CFOP</th><th>Cozinha</th><th></th></tr></thead><tbody>
    ${E.cardapio.itens.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(i.cat)}</td><td class="r">${m.brl(i.preco)}</td><td>${esc(i.ncm)}</td><td>${esc(i.cfop)}</td>
      <td>${i.cozinha === false ? "não" : "sim"}</td><td><button type="button" class="bt mini perigo" data-tirar-item="${esc(i.id)}" aria-label="Tirar ${esc(i.nome)} do cardápio">Tirar</button></td></tr>`).join("")}</tbody>`;
}

function desenharAjustes() {
  const f = $("form-ajustes");
  $("sel-uf").innerHTML = Object.keys(m.UF_IBGE).sort().map((u) => `<option${u === E.cfg.uf ? " selected" : ""}>${u}</option>`).join("");
  for (const k of ["nome", "cnpj", "ie", "endereco", "mesas", "servicoPct", "tributosPct"]) f.elements[k].value = E.cfg[k] ?? "";
}

function desenhar() {
  desenharSalao();
  desenharBalcao();
  desenharCozinha();
  desenharContador();
  desenharCaixa();
  desenharRelatorio();
  desenharCardapio();
}

// ---------------------------------------------------------------- diálogos
function abrirDlg(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
function fecharDlg(id) {
  const d = $(id);
  if (d.open) d.close();
}
function confirmar(texto, depois) {
  $("cf-texto").textContent = texto;
  const sim = $("cf-sim");
  const novo = sim.cloneNode(true);
  sim.replaceWith(novo);
  novo.addEventListener("click", () => { fecharDlg("dlg-confirmar"); depois(); });
  abrirDlg("dlg-confirmar");
}

// ---------------------------------------------------------------- eventos
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("button");
  if (!el) return;
  const d = el.dataset;
  if (d.aba) return abrirAba(d.aba);
  if (d.mesa) {
    const n = Number(d.mesa);
    return abrirComanda((comandaDaMesa(n) || novaComanda("mesa", n)).id);
  }
  if (d.comanda) return abrirComanda(d.comanda);
  if (d.add) return lancar(d.add);
  if (d.mais) return mudarQtd(d.mais, 1);
  if (d.menos) return mudarQtd(d.menos, -1);
  if (d.cat) { catAtual = d.cat; return desenharMenu(); }
  if (d.forma) { pgForma = d.forma; return desenharPagamento(); }
  if (d.tirarPg) { pgs.splice(Number(d.tirarPg), 1); return desenharPagamento(); }
  if (d.kds) {
    const k = E.cozinha.find((x) => x.id === d.kds);
    k.status = { fila: "preparo", preparo: "pronto", pronto: "entregue" }[k.status];
    E.cozinha = E.cozinha.filter((x) => x.status !== "entregue" || E.comandas[x.comanda]);
    salvar(); desenharCozinha(); return desenharContador();
  }
  if (d.revenda) {
    const v = E.vendas.find((x) => x.id === d.revenda);
    $("impressao").innerHTML = cupom(v);
    $("cp-titulo").textContent = v.titulo;
    return abrirDlg("dlg-cupom");
  }
  if (d.tirarItem) {
    return confirmar("Tirar este item do cardápio? Comandas abertas não mudam.", () => {
      E.cardapio.itens = E.cardapio.itens.filter((i) => i.id !== d.tirarItem);
      salvar(); desenharCardapio();
    });
  }
  switch (d.acao) {
    case "nova-balcao": return abrirComanda(novaComanda("balcao").id);
    case "nova-delivery": return abrirComanda(novaComanda("delivery").id);
    case "cozinha": return mandarCozinha();
    case "pagar": return abrirPagamento();
    case "add-pg": return lancarPagamento();
    case "finalizar": return finalizar();
    case "imprimir": return window.print();
    case "fechar-dlg": {
      const dlg = el.closest("dialog");
      fecharDlg(dlg.id);
      if (dlg.id === "dlg-pagar") abrirDlg("dlg-comanda");
      return desenhar();
    }
    case "cancelar-comanda": {
      const c = E.comandas[atual];
      return confirmar(`Cancelar ${tituloComanda(c)}? Os itens saem da conta e da cozinha.`, () => {
        E.cozinha = E.cozinha.filter((k) => k.comanda !== c.id);
        delete E.comandas[c.id];
        salvar(); fecharDlg("dlg-comanda"); desenhar();
      });
    }
    case "exportar": {
      const url = URL.createObjectURL(new Blob([JSON.stringify(E, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `pdv-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      return setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    case "zerar": return confirmar("Apagar vendas, comandas, caixa e cardápio deste aparelho? Não tem volta: baixe uma cópia antes.", () => {
      E = estadoNovo(); salvar(); desenharAjustes(); desenhar();
    });
  }
});

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.id === "busca") return desenharMenu();
  if (t.id === "pg-dividir") {
    const c = E.comandas[atual];
    const n = Number(t.value) || 1;
    $("pg-partes").textContent = n > 1 ? m.dividir(m.totais(c, E.cfg).total, n).map(m.brl).join(" · ") : "";
    if (n > 1 && !pgs.length) $("pg-valor").value = m.brl(m.dividir(m.totais(c, E.cfg).total, n)[0]).replace("R$ ", "");
  }
});

document.addEventListener("change", (ev) => {
  const t = ev.target;
  const c = E.comandas[atual];
  if (t.id === "chk-servico" && c) { c.servico = t.checked; salvar(); return desenharTotais(c); }
  if (t.id === "inp-desconto" && c) {
    const s = t.value.trim();
    if (!s) c.desconto = null;
    else if (s.endsWith("%")) {
      const p = Number(s.slice(0, -1).replace(",", "."));
      c.desconto = p > 0 ? { tipo: "pct", v: Math.min(p, 100) } : null;
    } else {
      const v = m.lerValor(s);
      c.desconto = v ? { tipo: "valor", v } : null;
    }
    salvar(); return desenharComanda();
  }
  if (t.dataset.campo && c) {
    c[t.dataset.campo] = t.dataset.campo === "entrega" ? (m.lerValor(t.value) ?? 0) : t.value.trim();
    salvar(); return desenharTotais(c);
  }
  if (t.dataset.obs && c) {
    const l = c.itens.find((i) => i.uid === t.dataset.obs);
    if (l) { l.obs = t.value.trim(); salvar(); }
  }
});

document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === "form-abrir") {
    const fundo = m.lerValor(f.elements.fundo.value || "0") ?? -1;
    if (fundo < 0) { $("erro-caixa").textContent = "Fundo de troco inválido."; return; }
    E.caixa = { aberto: true, fundo, movs: [], abertoEm: Date.now() };
    salvar(); return desenhar();
  }
  if (f.id === "form-mov") {
    const valor = m.lerValor(f.elements.valor.value);
    if (!valor) { $("erro-mov").textContent = "Digite o valor."; return; }
    E.caixa.movs.push({ tipo: ev.submitter?.value === "suprimento" ? "suprimento" : "sangria", valor, motivo: f.elements.motivo.value.trim(), t: Date.now() });
    salvar(); return desenharCaixa();
  }
  if (f.id === "form-fechar") {
    const contado = m.lerValor(f.elements.contado.value || "0");
    if (contado === null) { $("erro-fechar").textContent = "Valor contado inválido."; return; }
    const r = m.resumoCaixa(E.caixa, vendasDoCaixa());
    E.fechamentos.push({ em: Date.now(), vendido: r.vendido, esperado: r.esperadoDinheiro, contado, diferenca: contado - r.esperadoDinheiro, porForma: r.porForma });
    E.caixa = { aberto: false, fundo: 0, movs: [], abertoEm: null };
    salvar(); return desenhar();
  }
  if (f.id === "form-item") {
    const nome = f.elements.nome.value.trim();
    const cat = f.elements.cat.value.trim();
    const preco = m.lerValor(f.elements.preco.value);
    const ncm = f.elements.ncm.value.replace(/\D/g, "") || "21069090";
    const cfop = f.elements.cfop.value.replace(/\D/g, "") || "5102";
    let erro = "";
    if (nome.length < 2) erro = "Dê um nome ao item.";
    else if (!cat) erro = "Escolha ou crie uma categoria.";
    else if (!preco) erro = "Preço inválido. Use, por exemplo, 32,90.";
    else if (!/^\d{8}$/.test(ncm)) erro = "NCM tem 8 dígitos.";
    else if (!/^5\d{3}$/.test(cfop)) erro = "CFOP de venda dentro do estado começa com 5 e tem 4 dígitos.";
    $("erro-item").textContent = erro;
    if (erro) return;
    if (!E.cardapio.categorias.includes(cat)) E.cardapio.categorias.push(cat);
    E.cardapio.itens.push({ id: uid(), cat, nome, preco, ncm, cfop, cozinha: f.elements.cozinha.checked });
    f.reset();
    salvar(); return desenharCardapio();
  }
  if (f.id === "form-ajustes") {
    const el = f.elements;
    const cnpj = el.cnpj.value.trim();
    if (cnpj && !m.cnpjValido(cnpj)) { $("erro-ajustes").textContent = "CNPJ não confere."; return; }
    Object.assign(E.cfg, { nome: el.nome.value.trim() || "Meu restaurante", cnpj, ie: el.ie.value.trim(), uf: el.uf.value,
      endereco: el.endereco.value.trim(), mesas: Math.max(1, Math.min(99, Number(el.mesas.value) || 12)),
      servicoPct: Math.max(0, Math.min(20, Number(el.servicoPct.value) || 0)),
      tributosPct: Math.max(0, Math.min(60, Number(el.tributosPct.value) || 0)) });
    $("erro-ajustes").textContent = "Salvo.";
    salvar(); return desenhar();
  }
});

// Tema claro/escuro, lembrado em localStorage (chave pdv-tema).
$("tema").addEventListener("click", () => {
  const claro = document.documentElement.getAttribute("data-tema") !== "light";
  document.documentElement.setAttribute("data-tema", claro ? "light" : "dark");
  $("tema").setAttribute("aria-pressed", String(claro));
  $("tema").setAttribute("aria-label", claro ? "Usar tema escuro" : "Usar tema claro");
  try { localStorage.setItem("pdv-tema", claro ? "light" : "dark"); } catch { /* sem armazenamento */ }
});

{
  const claro = document.documentElement.getAttribute("data-tema") === "light";
  $("tema").setAttribute("aria-pressed", String(claro));
  $("tema").setAttribute("aria-label", claro ? "Usar tema escuro" : "Usar tema claro");
}
desenharAjustes();
desenhar();
document.body.classList.add("pronto");
