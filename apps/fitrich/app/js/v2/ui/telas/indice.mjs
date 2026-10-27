// Registro das telas. O shell descobre cada tela por aqui, carrega o módulo SOB DEMANDA (`import()`
// relativo e literal: sem URL montada, a CSP não precisa de 'unsafe-eval' nem de rede) e tolera tela
// que ainda não existe: o `carregar` rejeita e o shell mostra "em breve" em vez de quebrar. Assim as
// telas dos outros donos (Finanças/Cartões, Patrimônio/Metas/Dívidas/Shape/Check-in, Importar/Dados/
// Regras) entram quando chegarem, sem mexer no shell.
//
// `titulo` é a chave no dicionário do shell (`tela.<id>`): a navegação precisa do nome antes de o
// módulo da tela existir. Quando o módulo chega, o `tela` exportado por ele vale (titulo/icone/css/i18n).
export const TELAS = [
  { id: "hoje", grupo: "principal", ordem: 10, icone: "hoje", carregar: () => import("./hoje.mjs") },
  { id: "financas", grupo: "principal", ordem: 20, icone: "financas", carregar: () => import("./financas.mjs") },
  { id: "cartoes", grupo: "principal", ordem: 30, icone: "cartoes", carregar: () => import("./cartoes.mjs") },
  { id: "metas", grupo: "principal", ordem: 40, icone: "metas", carregar: () => import("./metas.mjs") },
  { id: "patrimonio", grupo: "mais", ordem: 50, icone: "patrimonio", carregar: () => import("./patrimonio.mjs") },
  { id: "plano", grupo: "mais", ordem: 55, icone: "plano", carregar: () => import("./plano.mjs") },
  { id: "dividas", grupo: "mais", ordem: 60, icone: "dividas", carregar: () => import("./dividas.mjs") },
  { id: "treino", grupo: "mais", ordem: 65, icone: "treino", carregar: () => import("./treino.mjs") },
  { id: "shape", grupo: "mais", ordem: 70, icone: "shape", carregar: () => import("./shape.mjs") },
  { id: "corpo", grupo: "mais", ordem: 75, icone: "corpo", carregar: () => import("./corpo.mjs") },
  { id: "nutricao", grupo: "mais", ordem: 76, icone: "nutricao", carregar: () => import("./nutricao.mjs") },
  { id: "checkin", grupo: "mais", ordem: 80, icone: "checkin", carregar: () => import("./checkin.mjs") },
  { id: "revisao", grupo: "mais", ordem: 85, icone: "checkin", carregar: () => import("./revisao.mjs") },
  { id: "importar", grupo: "mais", ordem: 90, icone: "importar", carregar: () => import("./importar.mjs") },
  { id: "dados", grupo: "mais", ordem: 100, icone: "dados", carregar: () => import("./dados.mjs") },
  { id: "regras", grupo: "mais", ordem: 110, icone: "regras", carregar: () => import("./regras.mjs") },
  { id: "aparelho", grupo: "mais", ordem: 120, icone: "celular", carregar: () => import("./aparelho.mjs") },
];

// Folhas: não são rota, sobem por cima da tela atual (o "+ Lançar").
export const FOLHAS = { lancar: () => import("./lancar.mjs") };

export const TELA_INICIAL = "hoje";
// Abas da navegação inferior (mobile): 4 telas + "Mais". A lateral (≥768px) mostra tudo.
export const ABAS_INFERIORES = ["hoje", "financas", "cartoes", "metas"];

export const porId = (id) => TELAS.find((t) => t.id === id) ?? null;

// Resolve o módulo de uma tela. Nunca lança: { ok, tela } ou { ok: false, codigo: "tela.em_breve" | "tela.invalida" }.
export async function carregarTela(entrada) {
  let mod;
  try { mod = await entrada.carregar(); } catch (erro) { return { ok: false, codigo: "tela.em_breve", erro }; }
  const tela = mod?.tela;
  if (!tela || tela.id !== entrada.id || typeof tela.montar !== "function") return { ok: false, codigo: "tela.invalida" };
  return { ok: true, tela };
}
