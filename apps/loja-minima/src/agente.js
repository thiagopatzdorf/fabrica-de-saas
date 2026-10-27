// O que a loja mostra a um AGENTE (software que compra em nome de uma pessoa).
// Nada aqui escreve: a compra em si é o mesmo `criarPedido` da vitrine, para a regra de preço, estoque e frete ser uma só.

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 50;

const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Catálogo paginado por cursor (id do último produto visto): o agente nunca precisa baixar a loja inteira de uma vez.
// Preço sempre em centavos inteiros; estoque exato nunca sai daqui.
export function catalogoParaAgente(catalogo, { q = "", categoria = "", limite, depois = "" } = {}, origem = "") {
  const n = Number.isSafeInteger(Number(limite)) ? Number(limite) : LIMITE_PADRAO;
  const max = Math.min(Math.max(n, 1), LIMITE_MAXIMO);
  const termo = norm(q).trim();
  const todos = Object.values(catalogo)
    .filter((p) => p.ativo && (p.estoque === null || p.estoque > 0))
    .filter((p) => !categoria || norm(p.categoria) === norm(categoria))
    .filter((p) => !termo || norm(`${p.nome} ${p.categoria} ${p.id}`).includes(termo))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter((p) => !depois || p.id > depois);
  const pagina = todos.slice(0, max);
  return {
    produtos: pagina.map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco_centavos: p.preco, moeda: "BRL", variacoes: p.variacoes, foto: p.fotos[0] ?? null, url: `${origem}/#${p.id}` })),
    depois: todos.length > max ? pagina.at(-1).id : null,
  };
}

// Contrato curto, em JSON, para um agente descobrir como comprar sem ler a vitrine.
export function descritor(origem, cfg) {
  return {
    loja: cfg.nome, moeda: "BRL", valores: "inteiros em centavos",
    catalogo: { metodo: "GET", url: `${origem}/api/agente/catalogo`, parametros: ["q", "categoria", "limite (1-50)", "depois (cursor)"] },
    comprar: {
      metodo: "POST", url: `${origem}/api/agente/pedidos`, corpo: "application/json",
      campos: { itens: [{ id: "id do produto", variacao: "se o produto tiver", qtd: "1-20" }], cliente: { nome: "", whatsapp: "só números com DDD", email: "opcional" }, entrega: { cep: "", rua: "", numero: "", complemento: "opcional", bairro: "", cidade: "", uf: "" } },
      cabecalhos: { "Idempotency-Key": "opcional, até 64 caracteres: repetir o pedido com a mesma chave devolve o mesmo pedido, sem cobrar duas vezes", "X-Agent-Name": "opcional: quem está comprando (aparece no pedido)" },
    },
    pagamento: { tipo: "link_de_pagamento", quem_paga: "a pessoa que o agente representa, no link devolvido (meios aceitos dependem do provedor de pagamento configurado)", autonomo: false },
    acompanhar: { metodo: "GET", url: `${origem}/api/pedido/{pedido}`, estados: ["aguardando_pagamento", "pago", "enviado", "cancelado"] },
  };
}
