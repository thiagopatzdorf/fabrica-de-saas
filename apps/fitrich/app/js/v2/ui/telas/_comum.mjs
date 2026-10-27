// Peças de apresentação compartilhadas pelas telas Patrimônio, Metas, Dívidas, Shape e Check-in.
// NÃO é uma tela (o sublinhado marca isso): existe para a mesma regra não viver em cinco cópias.
// Nada aqui tem texto literal de interface: todo rótulo chega já traduzido por `t()` da tela.
// Nada aqui toca armazenamento nem rede; `h` vem do ctx para o DOM nascer sempre pelo construtor seguro.
import { limiteUsado } from "../../cartao.mjs";
import { editar, saldoDaConta } from "../../esquema.mjs";
import { registrarSnapshot, snapshotMensal } from "../../patrimonio.mjs";
import { mesDe, somarDias } from "../../../datas.mjs";

// Reconciliar o saldo informado: o saldo passa a valer no INÍCIO de amanhã, então o que já aconteceu até
// hoje está dentro do número digitado e só lançamentos de amanhã em diante somam. Proposta registrada no PR:
// uma função `ajustarSaldo` no esquema que preserve o histórico (hoje o saldo de datas passadas vira o informado).
export const reconciliarConta = (d, contaId, centavos, hoje, opcoes) => editar(d, "contas", contaId, { saldoInicialCentavos: centavos, dataSaldoInicial: somarDias(hoje, 1) }, opcoes);

// Snapshot do mês (um por mês, substitui o anterior) com os dados externos calculados aqui.
export function gravarSnapshot(d, hoje, agora) {
  const novo = snapshotMensal(d, mesDe(hoje), dadosExternos(d, hoje));
  return { ...d, snapshots: registrarSnapshot(d.snapshots, novo), meta: { ...d.meta, atualizadoEm: agora() } };
}

// Entradas que `patrimonioLiquido` recebe de fora: saldos de conta (núcleo) e faturas em aberto (motor de
// cartão: fatura aberta + fechadas não pagas + futuras, que é o `limiteUsado`). Mesma conta em três telas.
export function faturasEmAbertoDe(d, hoje) {
  return (d.cartoes ?? []).map((c) => ({ cartaoId: c.id, ym: mesDe(hoje), centavos: Math.max(0, limiteUsado(c, d.lancamentos, hoje)) })).filter((f) => f.centavos > 0);
}
export const saldosPorContaDe = (d, hoje) => Object.fromEntries((d.contas ?? []).map((c) => [c.id, saldoDaConta(d, c.id, hoje) ?? 0]));
export const dadosExternos = (d, hoje) => ({ saldosPorConta: saldosPorContaDe(d, hoje), faturasEmAberto: faturasEmAbertoDe(d, hoje) });

// "1.234,56", "1234,56", "1234.56", "R$ 1.234" → 123456 (centavos inteiros). null quando não é número.
export function centavosDeTexto(txt) {
  const s = String(txt ?? "").trim().replace(/[^\d,.\-−]/g, "").replace("−", "-");
  if (!s || s === "-") return null;
  // Último separador é o decimal quando seguido de 1 ou 2 dígitos; seguido de exatamente 3 ("1.234", "R$ 1.234")
  // é milhar. Os demais separadores são sempre milhar.
  let ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (ultimo >= 0 && s.length - ultimo - 1 === 3) ultimo = -1;
  const inteiro = ultimo >= 0 ? s.slice(0, ultimo).replace(/[.,]/g, "") : s.replace(/[.,]/g, "");
  const dec = ultimo >= 0 ? s.slice(ultimo + 1) : "";
  if (dec.length > 2 || !/^-?\d*$/.test(inteiro) || !/^\d*$/.test(dec)) return null;
  const n = Number(`${inteiro || "0"}.${dec.padEnd(2, "0")}`);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// "80,5" → 80.5. null para vazio ou lixo.
export function numeroDeTexto(txt) {
  const s = String(txt ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Centavos → texto editável no idioma ("1234,56" em pt-BR, "1234.56" em en), sem símbolo nem milhar.
export const textoDeCentavos = (centavos, idioma = "pt-BR") => (centavos == null ? "" : (centavos / 100).toFixed(2).replace(".", idioma === "en" ? "." : ","));

// Largura útil para gráficos gerados no tamanho real: reduzir um SVG de 640 px a 340 px deixaria o texto com 6 px.
export const larguraGrafico = (doc = globalThis.document) => Math.max(300, Math.min(640, (doc?.documentElement?.clientWidth ?? 640) - 64));

// Cartão de número: rótulo pequeno, valor grande, nota opcional.
export function stat(h, { rotulo, valor, sub = null, classe = null }) {
  return h("div", { class: ["st", classe] }, h("span", { class: "st-rot" }, rotulo), h("b", { class: "st-val" }, valor), sub ? h("small", { class: "st-sub" }, sub) : null);
}

export const secao = (h, titulo, classe, ...filhos) => h("section", { class: ["cartao", classe] }, titulo ? h("h2", null, titulo) : null, ...filhos);

// Campo com <label> de verdade (WCAG 1.3.1/3.3.2). Devolve o label; o input está em `.input`.
export function campo(h, { rotulo, nome, tipo = "text", valor = "", attrs = {}, ajuda = null }) {
  const input = h("input", { type: tipo, name: nome, id: `c-${nome}-${idCampo++}`, value: valor ?? "", ...attrs });
  const label = h("label", { class: "campo", for: input.id }, h("span", { class: "campo-rot" }, rotulo), input, ajuda ? h("small", { class: "campo-ajuda" }, ajuda) : null);
  label.input = input;
  return label;
}
let idCampo = 0;

export function selecionar(h, { rotulo, nome, opcoes, valor }) {
  const select = h("select", { name: nome, id: `s-${nome}-${idCampo++}` }, opcoes.map((o) => h("option", { value: o.valor, selected: String(o.valor) === String(valor) }, o.texto)));
  const label = h("label", { class: "campo", for: select.id }, h("span", { class: "campo-rot" }, rotulo), select);
  label.input = select;
  return label;
}

// Estado nunca só por cor: ícone (decorativo) + texto, e a classe só reforça.
export function estado(h, { codigo, texto }) {
  const icone = { ok: "✓", atencao: "!", info: "i", passou: "→" }[codigo] ?? "•";
  return h("span", { class: ["estado", `estado-${codigo}`] }, h("i", { class: "estado-ic", "aria-hidden": "true" }, icone), h("span", null, texto));
}

// Barra de progresso acessível: <progress> nativo (lido por leitor de tela) com o número ao lado.
export function barra(h, { fracao, rotulo, classe = null }) {
  const pct = Math.max(0, Math.min(1, fracao ?? 0));
  return h("div", { class: ["barra", classe] }, h("progress", { max: 1000, value: Math.round(pct * 1000), "aria-label": rotulo }), h("span", { class: "barra-pct" }, `${Math.round(pct * 100)}%`));
}

// "X das últimas N semanas": N quadradinhos com texto equivalente (nunca sequência).
export function semanasGrade(h, { semanas, rotulo }) {
  return h("div", { class: "semanas", role: "img", "aria-label": rotulo }, semanas.map((s) => h("i", { class: ["semana", s.naMeta ? "semana-ok" : null], title: s.inicio })));
}

// Tabela-irmã de um gráfico, recolhida: todo gráfico tem a mesma informação em texto.
export function tabelaIrma(h, { resumo, cabecalho, linhas, aberta = false }) {
  return h("details", { class: "tab", open: aberta }, h("summary", null, resumo), h("div", { class: "rolar" }, h("table", null, h("thead", null, h("tr", null, cabecalho.map((c) => h("th", { scope: "col" }, c)))), h("tbody", null, linhas.map((l) => h("tr", null, l.map((c) => h("td", null, c))))))));
}

export const nota = (h, texto, classe = null) => h("p", { class: ["nota", classe] }, texto);
export const vazio = (h, texto) => h("p", { class: "vazio" }, texto);
// Aviso ao vivo: só avisos têm aria-live, nunca a tela inteira.
export const aviso = (h, texto) => h("p", { class: "aviso", role: "status", "aria-live": "polite" }, texto);

// Confirmação por <dialog> (não `confirm()`): resolve true/false. O dialog nasce e morre dentro de `raiz`.
export function confirmar(h, raiz, { titulo, texto, ok, cancelar }) {
  return new Promise((resolve) => {
    const fim = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const dlg = h("dialog", { class: "dialogo", onclose: () => { if (dlg.isConnected) { dlg.remove(); resolve(false); } } },
      h("h2", null, titulo), texto ? h("p", null, texto) : null,
      h("div", { class: "botoes" }, h("button", { type: "button", class: "peq", onclick: () => fim(false) }, cancelar), h("button", { type: "button", class: "perigo", onclick: () => fim(true) }, ok)));
    raiz.append(dlg);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  });
}

// Botão que abre/fecha um formulário (CRUD sem modal): o formulário fica logo abaixo, no fluxo.
export function alternador(h, { texto, alvo, aberto = false }) {
  alvo.hidden = !aberto;
  const b = h("button", { type: "button", class: "peq alternador", "aria-expanded": String(aberto), "aria-controls": alvo.id, onclick: () => { alvo.hidden = !alvo.hidden; b.setAttribute("aria-expanded", String(!alvo.hidden)); if (!alvo.hidden) alvo.querySelector("input,select")?.focus(); } }, texto);
  return b;
}

// Baixar um arquivo gerado no aparelho (export). Nada sai para a rede: é um Blob local.
export function baixar(doc, nome, texto, tipo) {
  const a = doc.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo }));
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const ultimos = (lista, n) => lista.slice(Math.max(0, lista.length - n));
export const sinal = (c) => (c > 0 ? "+" : c < 0 ? "−" : "");
