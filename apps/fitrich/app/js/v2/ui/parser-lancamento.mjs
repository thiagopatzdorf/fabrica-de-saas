// Parser do texto livre do Lançar: "almoço 32 mercado" → { centavos: 3200, categoriaId: "cat-mercado",
// descricao: "almoço" }. Puro e sem DOM; o que ele não reconhece volta como descrição, nunca como erro:
// o campo é um atalho, não um formulário. Entradas: `categorias` [{ id, tipo, nomes: [...] }] (nome do
// dado + tradução, para "groceries" casar "Mercado" na UI em inglês), `categorizar(descricao)` opcional
// (regras de categoria do app: devolve categoriaId ou null) e `hoje` para "ontem"/"yesterday".
import { somarDias, ehISO } from "../../datas.mjs";

const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Texto de dinheiro → centavos, pela convenção do idioma: pt-BR "1.234,56", en "1,234.56". Com os dois
// separadores, o ÚLTIMO é o decimal, nos dois idiomas. Devolve null se não for dinheiro.
export function lerValor(token, idioma = "pt-BR") {
  let s = String(token ?? "").replace(/^(r\$|R\$|\$|us\$|US\$)\s*/i, "").replace(/\s/g, "");
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;
  const v = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (v >= 0 && p >= 0) s = v > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (v >= 0) {
    if (idioma === "en" && /^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // "1,234" (en) = mil
    else if (s.split(",").length === 2) s = s.replace(",", "."); // uma vírgula só = decimal ("12,5", em qualquer idioma)
    else s = null;
  } else if (p >= 0) {
    if (idioma !== "en" && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.234" (pt-BR) = mil
    else if (s.split(".").length > 2) s = null;
  }
  if (s === null || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return Number.isSafeInteger(c) && c > 0 ? c : null;
}

const DATAS = {
  "pt-BR": { hoje: 0, hj: 0, ontem: -1, anteontem: -2 },
  en: { today: 0, yesterday: -1 },
};
const RECEITA = { "pt-BR": ["recebi", "receita", "entrada", "ganhei"], en: ["received", "income", "earned", "got"] };

export function analisar(texto, { categorias = [], categorizar = null, hoje, idioma = "pt-BR" } = {}) {
  const palavras = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  const r = { centavos: null, categoriaId: null, descricao: "", data: hoje ?? null, tipo: null };
  if (!palavras.length) return r;
  const resto = [];
  const nomes = categorias.flatMap((c) => (c.nomes ?? []).map((n) => ({ id: c.id, tipo: c.tipo, nome: normalizar(n), partes: normalizar(n).split(/\s+/).length })))
    .filter((c) => c.nome).sort((a, b) => b.partes - a.partes); // nome composto ("saúde e fitness") antes do simples
  let i = 0;
  while (i < palavras.length) {
    const p = palavras[i], np = normalizar(p);
    // Sinal "+" ou palavra de receita decide o tipo.
    if (r.tipo === null && (RECEITA[idioma] ?? []).includes(np)) { r.tipo = "receita"; i++; continue; }
    if (r.centavos === null) {
      const comSinal = np.startsWith("+") ? np.slice(1) : np;
      // "R$ 32" vem em dois tokens: junta com o próximo.
      const candidato = /^(r\$|\$|us\$)$/i.test(comSinal) && palavras[i + 1] ? comSinal + palavras[i + 1] : comSinal;
      const v = lerValor(candidato, idioma);
      if (v !== null) { r.centavos = v; if (np.startsWith("+")) r.tipo = "receita"; i += candidato === comSinal ? 1 : 2; continue; }
    }
    if (np in (DATAS[idioma] ?? {}) && hoje) { r.data = somarDias(hoje, DATAS[idioma][np]); i++; continue; }
    const dm = /^(\d{1,2})\/(\d{1,2})$/.exec(np);
    if (dm && hoje) {
      const [dia, mes] = idioma === "en" ? [dm[2], dm[1]] : [dm[1], dm[2]];
      const iso = `${hoje.slice(0, 4)}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
      if (ehISO(iso)) { r.data = iso > hoje ? `${Number(hoje.slice(0, 4)) - 1}${iso.slice(4)}` : iso; i++; continue; }
    }
    if (r.categoriaId === null) {
      const cat = nomes.find((c) => normalizar(palavras.slice(i, i + c.partes).join(" ")) === c.nome);
      if (cat) { r.categoriaId = cat.id; r.tipo ??= cat.tipo; i += cat.partes; continue; }
    }
    resto.push(p); i++;
  }
  r.descricao = resto.join(" ");
  if (r.categoriaId === null && r.descricao && typeof categorizar === "function") {
    const id = categorizar(r.descricao);
    if (id) { r.categoriaId = id; r.tipo ??= categorias.find((c) => c.id === id)?.tipo ?? null; }
  }
  r.tipo ??= "despesa";
  return r;
}
