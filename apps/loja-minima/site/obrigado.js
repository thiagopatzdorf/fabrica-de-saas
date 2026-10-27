import { api, el, reais } from "./dom.js";

const id = new URLSearchParams(location.search).get("p") || "";
const titulo = document.querySelector("#titulo");
const texto = document.querySelector("#texto");
const MENSAGEM = {
  aguardando_pagamento: ["Aguardando o pagamento", "Se você pagou com Pix, pode levar alguns instantes. Esta página confere sozinha."],
  pago: ["Pagamento confirmado", "Recebemos o seu pagamento. Vamos separar o pedido e avisar pelo WhatsApp."],
  enviado: ["Pedido enviado", "Seu pedido já saiu."],
  cancelado: ["Pedido cancelado", "Este pedido foi cancelado."],
};

async function conferir(tentativa = 0) {
  if (!/^[0-9a-f]{32}$/.test(id)) { titulo.textContent = "Pedido não encontrado"; return; }
  try {
    const { pedido } = await api(`/api/pedido/${id}`);
    const [t, d] = MENSAGEM[pedido.estado] || ["Seu pedido", ""];
    titulo.textContent = t;
    texto.textContent = pedido.rastreio ? `${d} Rastreio: ${pedido.rastreio}` : d;
    document.querySelector("#itens").replaceChildren(...pedido.itens.map((i) => el("li", { class: "linha", texto: `${i.qtd} × ${i.nome}${i.variacao ? ` (${i.variacao})` : ""}` })), el("li", { class: "linha" }, el("strong", { texto: `Total ${reais(pedido.total)}` })));
    if (pedido.estado === "aguardando_pagamento" && tentativa < 40) setTimeout(() => conferir(tentativa + 1), 5000);
  } catch { titulo.textContent = "Pedido não encontrado"; }
}
conferir();
