// Adaptador do slot "insights" da Hoje: pluga o cartão "Para olhar hoje" (cartao-para-olhar.mjs) no contrato de slots.
// O cartão chega async; uma resposta atrasada não escreve num slot já destruído.
import { cartaoParaOlhar } from "../cartao-para-olhar.mjs";

export const cartao = {
  montar(ctx) {
    const elemento = ctx.h("div", { class: "slot-olhar" });
    let vivo = true;
    const preencher = () => cartaoParaOlhar(ctx).then((no) => { if (vivo && no) elemento.replaceChildren(no); }).catch(() => {});
    preencher();
    return { elemento, atualizar: preencher, destruir() { vivo = false; } };
  },
};
