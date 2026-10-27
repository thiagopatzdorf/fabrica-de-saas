// Pedido: o navegador manda só ids e quantidades; preço, frete e total são SEMPRE recalculados aqui a partir do catálogo.
// Estados: aguardando_pagamento -> pago -> enviado, ou cancelado (a qualquer momento antes de enviado).
import { lerCatalogo, gravarCatalogo } from "./catalogo.js";
import { frete, lerConfig } from "./config.js";
import { MAX_CENTAVOS } from "./dinheiro.js";
import { criarCobranca, situacao } from "./pagamento.js";

export const ESTADOS = ["aguardando_pagamento", "pago", "enviado", "cancelado"];
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const texto = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");
export const idPedido = (id) => /^[0-9a-f]{32}$/.test(String(id));
export const refDoPedido = (id) => `loja-${id}`;

function validarCliente(c, e) {
  if (!c || typeof c !== "object" || !e || typeof e !== "object") return { erro: "Preencha os dados de contato e de entrega." };
  const nome = texto(c.nome, 100);
  const whatsapp = texto(c.whatsapp, 20).replace(/\D/g, "");
  const email = texto(c.email, 120);
  if (nome.length < 3) return { erro: "Informe seu nome completo." };
  if (!/^\d{10,15}$/.test(whatsapp)) return { erro: "WhatsApp com DDD, só números." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };
  const cep = texto(e.cep, 10).replace(/\D/g, "");
  const campos = { rua: texto(e.rua, 120), numero: texto(e.numero, 12), complemento: texto(e.complemento, 60), bairro: texto(e.bairro, 60), cidade: texto(e.cidade, 60), uf: texto(e.uf, 2).toUpperCase() };
  if (!/^\d{8}$/.test(cep) || !campos.rua || !campos.numero || !campos.cidade || !/^[A-Z]{2}$/.test(campos.uf)) return { erro: "Endereço incompleto (CEP, rua, número, cidade e UF)." };
  return { ok: { cliente: { nome, whatsapp, email }, entrega: { cep, ...campos } } };
}

// Itens do carrinho -> linhas com o preço do CATÁLOGO. Variação e estoque conferidos aqui, nunca no navegador.
export function montarItens(catalogo, itens) {
  if (!Array.isArray(itens) || !itens.length || itens.length > 30) return { erro: "O carrinho está vazio ou grande demais." };
  const linhas = [];
  const juntos = new Map();
  for (const i of itens) {
    const p = catalogo[String(i?.id)];
    const qtd = i?.qtd;
    if (!p || !p.ativo) return { erro: "Um produto do carrinho não está mais à venda." };
    if (!Number.isSafeInteger(qtd) || qtd < 1 || qtd > 20) return { erro: "Quantidade inválida." };
    const variacao = texto(i.variacao, 24);
    if (p.variacoes.length ? !p.variacoes.includes(variacao) : variacao) return { erro: `Escolha o tamanho de ${p.nome}.` };
    const chave = `${p.id}|${variacao}`;
    juntos.set(chave, (juntos.get(chave) ?? 0) + qtd);
    linhas.push({ id: p.id, nome: p.nome, variacao, preco: p.preco, qtd });
  }
  for (const p of Object.values(catalogo)) {
    const total = [...juntos].filter(([k]) => k.startsWith(`${p.id}|`)).reduce((a, [, q]) => a + q, 0);
    if (total && p.estoque !== null && total > p.estoque) return { erro: `Só temos ${p.estoque} de ${p.nome}.` };
  }
  return { ok: linhas };
}

export async function criarPedido(env, corpo, origem, agente = null) {
  const v = validarCliente(corpo?.cliente, corpo?.entrega);
  if (v.erro) return { status: 400, erro: v.erro };
  const catalogo = await lerCatalogo(env);
  const it = montarItens(catalogo, corpo?.itens);
  if (it.erro) return { status: 400, erro: it.erro };
  const cfg = await lerConfig(env);
  const subtotal = it.ok.reduce((a, l) => a + l.preco * l.qtd, 0);
  const fr = frete(cfg, subtotal);
  const total = subtotal + fr;
  if (total > MAX_CENTAVOS) return { status: 400, erro: "Valor acima do limite de uma compra." };
  const id = hex(16);
  const pedido = { id, estado: "aguardando_pagamento", criado: new Date().toISOString(), itens: it.ok, subtotal, frete: fr, total, ...v.ok, rastreio: "", ...(agente ? { agente: texto(agente, 60) } : {}) };
  // Grava ANTES de cobrar: se a cobrança falhar o pedido fica como aguardando e some sozinho da vitrine; nunca há cobrança sem pedido.
  await env.ESTADO.put(`pedido:${id}`, JSON.stringify(pedido));
  try {
    const { url } = await criarCobranca(env, { ref: refDoPedido(id), descricao: `${cfg.nome}: pedido ${id.slice(0, 8)}`.slice(0, 120), valor: total, retorno: `${origem}/obrigado.html?p=${id}` });
    return { status: 201, corpo: { pedido: id, url, total } };
  } catch {
    await env.ESTADO.put(`pedido:${id}`, JSON.stringify({ ...pedido, estado: "cancelado", motivo: "cobrança não criada" }));
    return { status: 502, erro: "Não consegui abrir o pagamento agora. Tente de novo em instantes." };
  }
}

export async function lerPedido(env, id) {
  if (!idPedido(id)) return null;
  try { return JSON.parse((await env.ESTADO.get(`pedido:${id}`)) || "null"); } catch { return null; }
}

// Confere no pagamento se um pedido em aberto foi pago. A transição é uma só (aguardando -> pago) e é ela que baixa o estoque,
// então repetir a consulta nunca baixa duas vezes. (KV não é transacional: dois leitores simultâneos podem baixar em dobro;
// com o volume de uma loja pequena o risco é aceito e o painel mostra o estoque para correção manual.)
export async function conferirPagamento(env, pedido) {
  if (pedido.estado !== "aguardando_pagamento") return pedido;
  let pago = false;
  try { pago = (await situacao(env, refDoPedido(pedido.id))).pago; } catch { return pedido; }
  if (!pago) return pedido;
  const atual = await lerPedido(env, pedido.id);
  if (!atual || atual.estado !== "aguardando_pagamento") return atual ?? pedido;
  const novo = { ...atual, estado: "pago", pago_em: new Date().toISOString() };
  await env.ESTADO.put(`pedido:${pedido.id}`, JSON.stringify(novo));
  const catalogo = await lerCatalogo(env);
  for (const l of novo.itens) if (catalogo[l.id] && catalogo[l.id].estoque !== null) catalogo[l.id].estoque = Math.max(0, catalogo[l.id].estoque - l.qtd);
  await gravarCatalogo(env, catalogo);
  return novo;
}

// O que a página "obrigado" mostra a quem tem o id (128 bits, impossível de adivinhar): sem endereço, telefone ou e-mail.
export const resumoPublico = (p) => ({ id: p.id, estado: p.estado, total: p.total, itens: p.itens.map(({ nome, variacao, qtd }) => ({ nome, variacao, qtd })), rastreio: p.estado === "enviado" ? p.rastreio : "" });
