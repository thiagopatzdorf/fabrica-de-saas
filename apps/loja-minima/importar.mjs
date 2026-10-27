// Importa um catálogo simples (CSV ou JSON) para o formato da Loja Mínima. Só TRANSFORMA e valida cada produto com o mesmo
// `validarProduto` que o painel usa: produto que a loja recusaria nunca vira registro. Não escreve em loja nenhuma.
//   node importar.mjs produtos.csv --saida catalogo.json
//   node importar.mjs produtos.json --saida catalogo.json
// Colunas (CSV) ou chaves (JSON): id, nome, categoria, descricao, preco (em REAIS: "59,90" ou 59.9), preco_antigo, estoque (vazio = sem
// controle), variacoes (separadas por |), fotos (separadas por |; https ou caminho do site), destaque (sim/não), ativo (sim/não; padrão sim).
// O JSON pode ser uma lista de objetos ou um objeto id -> produto. Depois: `wrangler kv key put --binding ESTADO catalogo --path catalogo.json`.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validarProduto } from "./src/catalogo.js";

// CSV com aspas ("a, b", "" para aspas literais), vírgula ou ponto e vírgula como separador, quebras de linha dentro de aspas.
export function lerCsv(texto) {
  const t = texto.replace(/^\uFEFF/, "");
  const sep = (t.split("\n", 1)[0].match(/;/g) || []).length > (t.split("\n", 1)[0].match(/,/g) || []).length ? ";" : ",";
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; linha.push(campo); campo = ""; if (linha.some((x) => x !== "")) linhas.push(linha); linha = []; }
    else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x !== "")) linhas.push(linha);
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  const nomes = cab.map((x) => x.trim().toLowerCase());
  return resto.map((l) => Object.fromEntries(nomes.map((n, i) => [n, (l[i] ?? "").trim()])));
}

// "59,90" | "1.299,90" | "59.9" | 59.9 -> centavos inteiros, sem erro de ponto flutuante. Inválido -> null.
export function reaisParaCentavos(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  let s = String(v).replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/,/g) || []).length) s = s.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, c = ""] = s.split(".");
  return Number(r) * 100 + Number(c.padEnd(2, "0"));
}

const lista = (v) => (Array.isArray(v) ? v : String(v ?? "").split("|")).map((x) => String(x).trim()).filter(Boolean);
const sim = (v, padrao) => (v === undefined || v === "" ? padrao : v === true || /^(sim|s|true|1|yes)$/i.test(String(v).trim()));
export const idSeguro = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");

// Uma linha/objeto de entrada -> candidato no formato da loja (ainda não validado). Preço inválido vira NaN para o validador recusar.
export function paraProduto(l) {
  const preco = reaisParaCentavos(l.preco);
  const antigo = reaisParaCentavos(l.preco_antigo);
  const estoque = l.estoque === undefined || l.estoque === "" || l.estoque === null ? null : Number(l.estoque);
  return {
    id: idSeguro(l.id || l.nome || ""), nome: l.nome, categoria: l.categoria, descricao: l.descricao,
    preco: preco ?? NaN, preco_antigo: antigo, fotos: lista(l.fotos), estoque, variacoes: lista(l.variacoes),
    destaque: sim(l.destaque, false), ativo: sim(l.ativo, true),
  };
}

// Valida tudo com a regra da loja. Devolve o catálogo (id -> produto) e a contagem de recusados por motivo, sem esconder nenhum.
export function montarCatalogo(candidatos) {
  const catalogo = {};
  const recusados = {};
  for (const c of candidatos) {
    const r = validarProduto(c);
    if (r.erro) { recusados[r.erro] = (recusados[r.erro] ?? 0) + 1; continue; }
    if (catalogo[r.ok.id]) { recusados["id repetido"] = (recusados["id repetido"] ?? 0) + 1; continue; }
    catalogo[r.ok.id] = r.ok;
  }
  return { catalogo, recusados };
}

export function lerEntrada(arquivo, conteudo) {
  if (/\.json$/i.test(arquivo)) {
    const j = JSON.parse(conteudo);
    return Array.isArray(j) ? j : Object.values(j);
  }
  return lerCsv(conteudo);
}

function principal(argv) {
  const arq = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--saida");
  const saida = argv[argv.indexOf("--saida") + 1];
  if (!arq || argv.indexOf("--saida") < 0 || !saida) throw new Error("uso: node importar.mjs <produtos.csv|produtos.json> --saida <catalogo.json>");
  const candidatos = lerEntrada(arq, readFileSync(arq, "utf8")).map(paraProduto);
  const { catalogo, recusados } = montarCatalogo(candidatos);
  writeFileSync(saida, JSON.stringify(catalogo));
  console.log(JSON.stringify({ candidatos: candidatos.length, aceitos: Object.keys(catalogo).length, recusados }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { principal(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
