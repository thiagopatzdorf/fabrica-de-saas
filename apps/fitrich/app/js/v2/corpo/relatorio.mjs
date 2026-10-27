// Relatório para levar ao médico ou à nutricionista: UM arquivo HTML imprimível, montado no aparelho (nada sai para a
// rede). Só números que a pessoa registrou, com a fonte e a ressalva de cada índice. Não interpreta, não diagnostica.
// `t` e `fmt` vêm da tela (mesmo dicionário `corpo.*`), então o relatório sai no idioma do app.
import { dia, somarDias } from "../../datas.mjs";
import { composicaoCorporal } from "./composicao.mjs";
import { alertasDePeso, taxaSemanal, tendenciaEma } from "./tendencia.mjs";
import { dividaDeSono, faixaSono, idadeEm, metaSonoHoras, pontoMedioMin, regularidade } from "./sono.mjs";
import { metaAguaMl } from "./agua.mjs";
import { indiceRecuperacao } from "./recuperacao.mjs";
import { bemestarDoDia } from "./bemestar.mjs";

// Texto da pessoa (nome de tipo de treino vem do esquema, mas a UI é hostil por princípio): tudo passa por aqui.
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:24px auto;max-width:760px;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:4px 8px;text-align:left;font-variant-numeric:tabular-nums}
th{background:#f0f0f0}.aviso{border:1px solid #999;padding:8px 12px;background:#f7f7f7}.fonte{color:#444;font-size:12px}
@media print{body{margin:0}h2{break-after:avoid}table{break-inside:avoid}}`;

export function montarRelatorio(d, hoje, { t, fmt, idioma = "pt-BR" }) {
  const n1 = (v) => fmt.numero(v, 1), kg = (v) => `${n1(v)} kg`;
  const tabela = (cab, linhas) => `<table><thead><tr>${cab.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const secao = (titulo, corpo) => `<section><h2>${esc(titulo)}</h2>${corpo}</section>`;
  const faixa = (pref, cod) => (cod ? t(`corpo.${pref}.${cod}`) : "—");
  const hm = (v) => { const m = Math.round(v * 60); return t("corpo.hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") }); };

  const c = composicaoCorporal(d, hoje);
  const pesos = d.pesos.filter((p) => p.data <= hoje), serie = tendenciaEma(pesos), taxa = taxaSemanal(pesos, hoje), ult = serie[serie.length - 1];
  const meta = d.metas.find((m) => m.tipo === "peso")?.alvo ?? null;
  const alertas = ult ? alertasDePeso({ atualKg: ult.tendencia, metaKg: meta, alturaCm: d.perfil.alturaCm, taxa }) : [];
  const secPeso = ult
    ? tabela([t("corpo.rel.item"), t("corpo.rel.valor")], [
      [t("corpo.peso.ultimo"), `${kg(ult.kg)} (${fmt.data(ult.data)})`], [t("corpo.peso.tendencia"), kg(ult.tendencia)],
      [t("corpo.peso.ritmo"), taxa ? t("corpo.rel.ritmo", { v: `${taxa.kgPorSemana > 0 ? "+" : ""}${fmt.numero(taxa.kgPorSemana, 2)}`, margem: fmt.numero(taxa.margem, 2), n: taxa.pontos }) : t("corpo.peso.ritmoPrecisa")],
      [t("corpo.peso.meta"), meta != null ? kg(meta) : "—"]]) + alertas.map((a) => `<p class="aviso">${esc(t(`corpo.peso.alerta.${a}`))}</p>`).join("")
      + tabela([t("corpo.data"), t("corpo.peso.colPeso"), t("corpo.peso.colTendencia")], serie.slice(-14).reverse().map((p) => [fmt.data(p.data), n1(p.kg), n1(p.tendencia)])) + `<p class="fonte">${esc(t("corpo.peso.como"))}</p>`
    : `<p>${esc(t("corpo.peso.semPesagens"))}</p>`;

  const lin = (rot, v, f) => [t(`corpo.comp.${rot}`), v, f];
  const secComp = tabela([t("corpo.rel.item"), t("corpo.rel.valor"), t("corpo.rel.faixa")], [
    lin("imc", c.imc != null ? n1(c.imc) : "—", faixa("imcFaixa", c.imcFaixa)), lin("gordura", c.gordura != null ? `${n1(c.gordura)}%` : "—", faixa("gorduraFaixa", c.gorduraFaixa)),
    lin("rcq", c.rcq != null ? fmt.numero(c.rcq, 2) : "—", faixa("rcqFaixa", c.rcqFaixa)), lin("rce", c.rce != null ? fmt.numero(c.rce, 2) : "—", faixa("rceFaixa", c.rceFaixa)),
    lin("massaMagra", c.massaMagraKg != null ? kg(c.massaMagraKg) : "—", "—"), lin("ffmi", c.ffmiNorm != null ? n1(c.ffmiNorm) : "—", c.ffmiFaixa ? faixa("ffmiFaixa", c.ffmiFaixa) : "—")])
    + `<p class="fonte">${["imc", "gordura", "rcq", "rce", "massaMagra", "ffmi"].map((k) => `<b>${esc(t(`corpo.comp.${k}`))}</b> ${esc(t(`corpo.comp.lim.${k}`))}`).join("<br>")}</p>`;

  const ini = dia(hoje) - 13, dias14 = d.bemestar.filter((b) => dia(b.data) >= ini && dia(b.data) <= dia(hoje)).sort((a, b) => (a.data < b.data ? 1 : -1));
  const metaSono = metaSonoHoras(d.perfil, hoje), idade = idadeEm(d.perfil.nascimento, hoje), fs = faixaSono(idade);
  const noites = dias14.filter((b) => b.sonoHoras != null), reg = regularidade(dias14.filter((b) => b.dormiuMin != null && b.acordouMin != null).map((b) => pontoMedioMin(b.dormiuMin, b.acordouMin))), div = dividaDeSono(d.bemestar, hoje, metaSono);
  const secSono = (noites.length ? tabela([t("corpo.rel.item"), t("corpo.rel.valor")], [
    [t("corpo.sono.media"), hm(noites.reduce((s, b) => s + b.sonoHoras, 0) / noites.length)], [t("corpo.sono.naFaixa"), t("corpo.rel.faixaSono", { min: fs.min, max: fs.max })],
    [t("corpo.sono.regularidade"), reg ? t("corpo.sono.minutos", { n: fmt.numero(reg.desvioMin, 0) }) : "—"], [t("corpo.sono.divida"), div ? hm(div.deficitHoras) : "—"]]) : `<p>${esc(t("corpo.sono.semNoites"))}</p>`)
    + (dias14.length ? tabela([t("corpo.data"), t("corpo.sono.colHoras"), t("corpo.sono.colQualidade"), t("corpo.energia"), t("corpo.dor"), t("corpo.rel.agua")], dias14.map((b) => [fmt.data(b.data), b.sonoHoras != null ? hm(b.sonoHoras) : "—", b.sonoQualidade != null ? `${b.sonoQualidade}/5` : "—", b.energia != null ? `${b.energia}/5` : "—", b.dor != null ? `${b.dor}/5` : "—", b.aguaMl != null ? `${fmt.numero(b.aguaMl)} ml` : "—"])) : "")
    + `<p class="fonte">${esc(t("corpo.sono.como"))}</p>`;

  const aguas = dias14.filter((b) => b.aguaMl != null);
  const metaAgua = metaAguaMl(ult?.kg ?? null);
  const secAgua = aguas.length ? `<p>${esc(t("corpo.rel.aguaMedia", { ml: fmt.numero(Math.round(aguas.reduce((s, b) => s + b.aguaMl, 0) / aguas.length)), meta: fmt.numero(metaAgua.ml), n: aguas.length }))}</p><p class="fonte">${esc(t("corpo.agua.ressalva"))}</p>` : `<p>${esc(t("corpo.rel.semAgua"))}</p>`;

  const r = indiceRecuperacao({ bemestar: bemestarDoDia(d, hoje), treinos: d.treinos, hoje, metaSonoHoras: metaSono });
  const secRec = r.pontos == null ? `<p>${esc(t("corpo.rec.semDado"))}</p>` : `<p>${esc(t("corpo.rel.indice", { p: r.pontos, faixa: t(`corpo.rec.faixa.${r.faixa}`) }))}</p>`
    + tabela([t("corpo.rec.colTermo"), t("corpo.rec.colValor"), t("corpo.rec.colPeso"), t("corpo.rec.colPontos")], r.termos.map((x) => [t(`corpo.rec.termo.${x.id}`), x.valor == null ? t("corpo.rec.semDadoTermo") : `${fmt.numero(x.valor * 100, 0)}%`, String(x.peso), x.pontos == null ? "—" : fmt.numero(x.pontos, 1)])) + `<p class="fonte">${esc(t("corpo.rec.como"))}</p>`;

  const t28 = d.treinos.filter((x) => x.data >= somarDias(hoje, -27) && x.data <= hoje);
  const secTreino = t28.length ? `<p>${esc(t("corpo.rel.treinos", { n: t28.length, min: fmt.numero(t28.reduce((s, x) => s + x.minutos, 0)) }))}</p>` : `<p>${esc(t("corpo.rel.semTreinos"))}</p>`;

  const corpo = `<h1>${esc(t("corpo.rel.titulo"))}</h1><p>${esc(t("corpo.rel.geradoEm", { data: fmt.data(hoje) }))}${d.perfil.alturaCm ? ` · ${esc(t("corpo.altura"))}: ${esc(fmt.numero(d.perfil.alturaCm, 0))} cm` : ""}${idade != null ? ` · ${esc(t("corpo.rel.idade", { idade }))}` : ""}</p>
<p class="aviso">${esc(t("corpo.rel.aviso"))}</p>
${secao(t("corpo.peso.titulo"), secPeso)}${secao(t("corpo.comp.titulo"), secComp)}${secao(t("corpo.sono.titulo"), secSono)}${secao(t("corpo.agua.titulo"), secAgua)}${secao(t("corpo.rec.titulo"), secRec)}${secao(t("corpo.rel.treinosTitulo"), secTreino)}
<p class="fonte">${esc(t("corpo.rel.rodape"))}</p>`;
  return `<!doctype html>\n<html lang="${idioma === "en" ? "en" : "pt-BR"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t("corpo.rel.titulo"))} ${esc(hoje)}</title><style>${CSS}</style></head><body>${corpo}</body></html>`;
}
