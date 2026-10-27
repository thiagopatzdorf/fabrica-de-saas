// Harness mínimo (o shell real está sendo escrito por outro agente): monta UMA tela pelo contrato `tela`
// com o `criarCtx` real sobre os dados de exemplo. Querystring: ?tela=shape&idioma=en&tema=light&hoje=2026-10-05
// Expõe `window.harness` para o Playwright ler estado, erros e `i18n.faltando()`.
import { criarCtx } from "/js/v2/ui/ctx.mjs";
import { criarI18n } from "/js/v2/ui/i18n.mjs";
import { indicesVigentes } from "/js/v2/indices.mjs";
import { validar } from "/js/v2/esquema.mjs";
import { dadosExemplo, HOJE } from "/tests/ui/dados-exemplo-patrimonio.mjs";

const q = new URLSearchParams(location.search);
const nome = q.get("tela") ?? "patrimonio", idioma = q.get("idioma") ?? "pt-BR", tema = q.get("tema") ?? "dark", hoje = q.get("hoje") ?? HOJE;
document.documentElement.setAttribute("data-gs-theme", tema);
document.documentElement.lang = idioma;

const { tela } = await import(`/js/v2/ui/telas/${nome}.mjs`);
const dic = (await import(tela.i18n)).default; // módulo, não fetch: a CSP de produção tem connect-src 'none'
const vazios = (await import("/js/v2/ui/vazios.i18n.mjs")).default; // textos dos estados vazios (ctx.estadoVazio)
const i18n = criarI18n({ idioma, dicionarios: [dic, vazios] });
for (const href of [tela.css ?? []].flat()) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); await new Promise((r) => { l.onload = r; l.onerror = r; }); }

let dados = q.get("vazio") === "1" ? (await import("/js/v2/esquema.mjs")).vazio({ agora: () => `${hoje}T09:00:00.000Z` }) : dadosExemplo({ hoje });
let seq = 1000;
const gravacoes = [];
let montada;
const ctx = criarCtx({
  estado: () => dados,
  mudar: (fn) => Promise.resolve().then(() => {
    const novo = fn(dados);
    const v = validar(novo);
    if (!v.ok) { const e = new Error("esquema"); e.erros = v.erros; throw e; }
    dados = novo; gravacoes.push(Date.now()); montada?.atualizar?.();
  }),
  i18n, hoje: () => hoje, agora: () => new Date().toISOString(), novoId: () => `h-${++seq}`, indices: indicesVigentes(), navegar: () => {},
});
montada = tela.montar(ctx);
document.getElementById("vista").append(montada.elemento);
window.harness = { get dados() { return dados; }, faltando: () => i18n.faltando(), gravacoes, tela: nome, idioma, tema, hoje };
