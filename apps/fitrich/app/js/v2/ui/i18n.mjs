// i18n sem biblioteca: dicionários JSON por tela {"pt-BR": {chave: texto}, "en": {...}}, chaves com prefixo
// da tela ("cartoes.titulo"). Placeholders {nome}. Plural por `Intl.PluralRules` com sufixos `.one`/`.other`
// quando `params.n` existe ("treino.contagem.one" / ".other"). Chave que falta devolve "[chave]" e fica em
// `faltando()`: o teste de paridade e o teste de navegador falham se sobrar alguma.
export const IDIOMAS = ["pt-BR", "en"];

export function criarI18n({ idioma = "pt-BR", dicionarios = [] } = {}) {
  let atual = IDIOMAS.includes(idioma) ? idioma : "pt-BR";
  const dic = { "pt-BR": {}, en: {} };
  const faltou = new Set();
  const somar = (d) => { for (const l of IDIOMAS) Object.assign(dic[l], d?.[l] ?? {}); };
  dicionarios.forEach(somar);
  const sub = (txt, params) => txt.replace(/\{(\w+)\}/g, (m, k) => (params && k in params ? String(params[k]) : m));
  function t(chave, params) {
    let txt;
    if (params && Number.isFinite(params.n)) {
      const cat = new Intl.PluralRules(atual === "en" ? "en-US" : "pt-BR").select(params.n);
      txt = dic[atual][`${chave}.${cat}`] ?? dic[atual][`${chave}.other`];
    }
    txt ??= dic[atual][chave];
    if (txt == null) { faltou.add(`${atual}:${chave}`); return `[${chave}]`; }
    return sub(txt, params);
  }
  return { t, somar, faltando: () => [...faltou], get idioma() { return atual; }, definir(l) { if (IDIOMAS.includes(l)) atual = l; return atual; } };
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
// Paridade: toda chave pt-BR existe em en (e vice-versa) com os MESMOS placeholders. Devolve a lista de problemas.
export function paridade(dic) {
  const pt = dic["pt-BR"] ?? {}, en = dic.en ?? {}, erros = [];
  for (const k of Object.keys(pt)) { if (!(k in en)) erros.push(`en sem ${k}`); else if (placeholders(pt[k]) !== placeholders(en[k])) erros.push(`placeholders divergem em ${k}`); }
  for (const k of Object.keys(en)) if (!(k in pt)) erros.push(`pt-BR sem ${k}`);
  for (const [l, d] of Object.entries({ "pt-BR": pt, en })) for (const [k, v] of Object.entries(d)) if (typeof v !== "string" || !v.trim()) erros.push(`${l}:${k} vazio`);
  return erros;
}
