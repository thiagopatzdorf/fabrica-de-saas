// Aba "Cardio": registrar tempo, distância, FC média e esforço; ritmo e velocidade; zonas por FC máxima
// (Tanaka pela idade, ou a que a pessoa informar) com reserva de Karvonen quando há FC de repouso; e a meta
// semanal de referência da OMS (150–300 min) contada em semanas, nunca em sequência.
import { MODALIDADES } from "../../../treino/constantes.mjs";
import { META_SEMANAL_MIN, apagarCardio, fcMaxDaPessoa, registrarCardio, resumoDoRegistro, resumoSemanal, semanasNaMetaCardio, temDistancia, zonasDaPessoa } from "../../../treino/cardio.mjs";
import { mmss } from "../../../treino/formulas.mjs";
import { definir } from "../../../esquema.mjs";
import { alternador, aviso, barra, campo, confirmar, estado, nota, numeroDeTexto, secao, selecionar, semanasGrade, stat, vazio } from "../_comum.mjs";
import { numTexto } from "./comum.mjs";

export function aba(ctx, ui, render, raiz) {
  const { h, t, fmt } = ctx;
  const d = ctx.estado(), hoje = ctx.hoje(), partes = [];
  const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("treino.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
  if (ui.msg) partes.push(aviso(h, ui.msg));
  // ---- semana ----
  const sem = resumoSemanal(d.cardio, hoje), meta = semanasNaMetaCardio(d.cardio, hoje, 8);
  partes.push(secao(h, t("treino.cardioSemana"), "treino-cardio-semana",
    h("div", { class: "grade" },
      stat(h, { rotulo: t("treino.minutosSemana"), valor: `${sem.minutos} min`, sub: t("treino.metaOms", { min: META_SEMANAL_MIN.min, max: META_SEMANAL_MIN.max }) }),
      stat(h, { rotulo: t("treino.distancia"), valor: `${fmt.numero(sem.km, 1)} km`, sub: t("treino.sessoesN", { n: sem.sessoes }) }),
      stat(h, { rotulo: t("treino.ultimas8"), valor: t("treino.xDeN", { x: meta.naMeta, n: meta.de }), sub: t("treino.semanasComMeta", { min: META_SEMANAL_MIN.min }) })),
    barra(h, { fracao: sem.minutos / META_SEMANAL_MIN.min, rotulo: t("treino.progressoMeta") }), semanasGrade(h, { semanas: meta.semanas, rotulo: t("treino.semanasComMetaN", { x: meta.naMeta, n: meta.de, min: META_SEMANAL_MIN.min }) }),
    nota(h, t("treino.omsNota"))));
  // ---- zonas ----
  const z = zonasDaPessoa(d.perfil), fcForm = formFc(ctx, d, salvar);
  const zc = [];
  if (z) {
    zc.push(nota(h, t(z.fcMax.origem === "informada" ? "treino.fcInformada" : "treino.fcTanaka", { max: z.fcMax.valor, fox: z.fcMax.fox ?? "" })), nota(h, t(z.metodo === "karvonen" ? "treino.zonasKarvonen" : "treino.zonasPercentual")));
    zc.push(h("div", { class: "rolar" }, h("table", null, h("thead", null, h("tr", null, [t("treino.zona"), t("treino.faixaFc"), t("treino.sensacao")].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", null, z.zonas.map((x) => h("tr", null, h("th", { scope: "row" }, `Z${x.zona} · ${t(`treino.zonaNome.${x.zona}`)}`), h("td", { class: "num" }, `${x.de}–${x.ate} bpm`), h("td", null, t(`treino.zonaDica.${x.zona}`))))))));
  } else zc.push(vazio(h, t("treino.semIdade")));
  zc.push(h("div", { class: "botoes" }, alternador(h, { texto: t("treino.ajustarFc"), alvo: fcForm, aberto: !z })), fcForm);
  partes.push(secao(h, t("treino.zonas"), "treino-zonas", ...zc));
  // ---- registrar ----
  const form = formCardio(ctx, d, hoje, salvar);
  partes.push(secao(h, t("treino.registrarCardio"), "treino-cardio-form", h("div", { class: "botoes" }, alternador(h, { texto: t("treino.novoCardio"), alvo: form, aberto: !d.cardio.length })), form));
  // ---- recentes ----
  const rec = [...d.cardio].slice(-10).reverse();
  partes.push(secao(h, t("treino.cardioRecentes"), "treino-cardio-lista", rec.length ? h("ul", { class: "lista" }, rec.map((c) => {
    const r = resumoDoRegistro(c, d.perfil), partesTxt = [`${c.minutos} min`];
    if (c.km) partesTxt.push(`${numTexto(c.km, ctx.idioma())} km`);
    if (r.ritmoSeg && c.modalidade !== "bicicleta") partesTxt.push(`${mmss(r.ritmoSeg)}/km`);
    if (r.kmh && c.modalidade === "bicicleta") partesTxt.push(`${numTexto(r.kmh, ctx.idioma())} km/h`);
    if (c.fcMedia) partesTxt.push(`${c.fcMedia} bpm${r.zona != null ? ` · ${r.zona === 0 ? t("treino.abaixoZ1") : `Z${r.zona}`}` : ""}`);
    return h("li", null, h("span", { class: "item" }, `${fmt.data(c.data)} · ${t(`treino.modalidade.${c.modalidade}`)}`, h("small", null, partesTxt.join(" · "))),
      h("button", { type: "button", class: "peq", "aria-label": t("treino.apagarCardioDe", { data: fmt.data(c.data) }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("treino.apagarCardioDe", { data: fmt.data(c.data) }), texto: null, ok: t("treino.apagar"), cancelar: t("treino.cancelar") })) salvar((x) => apagarCardio(x, c.id, { agora: ctx.agora })); } }, t("treino.apagar")));
  })) : vazio(h, t("treino.semCardio"))));
  return partes;
}

function formFc(ctx, d, salvar) {
  const { h, t } = ctx;
  const idade = campo(h, { rotulo: t("treino.idade"), nome: "fc-idade", valor: d.perfil.idade ?? "", attrs: { inputmode: "numeric" } });
  const max = campo(h, { rotulo: t("treino.fcMax"), nome: "fc-max", valor: d.perfil.fcMaxBpm ?? "", attrs: { inputmode: "numeric" }, ajuda: t("treino.fcMaxAjuda") });
  const rep = campo(h, { rotulo: t("treino.fcRepouso"), nome: "fc-rep", valor: d.perfil.fcRepousoBpm ?? "", attrs: { inputmode: "numeric" }, ajuda: t("treino.fcRepousoAjuda") });
  const n = (c) => { const v = c.input.value.trim(); return v === "" ? null : Number(v); };
  return h("form", { id: "form-fc", class: "form-crud", onsubmit: (e) => { e.preventDefault(); salvar((x) => definir(x, "perfil", { idade: n(idade), fcMaxBpm: n(max), fcRepousoBpm: n(rep) }, { agora: ctx.agora })); } },
    idade, max, rep, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("treino.salvar"))), nota(h, t("treino.fcAviso")));
}

function formCardio(ctx, d, hoje, salvar) {
  const { h, t } = ctx;
  const data = campo(h, { rotulo: t("treino.data"), nome: "cdata", tipo: "date", valor: hoje, attrs: { required: true } });
  const mod = selecionar(h, { rotulo: t("treino.modalidadeCampo"), nome: "cmod", valor: "corrida", opcoes: MODALIDADES.map((m) => ({ valor: m, texto: t(`treino.modalidade.${m}`) })) });
  const min = campo(h, { rotulo: t("treino.minutos"), nome: "cmin", valor: "30", attrs: { inputmode: "numeric", required: true } });
  const km = campo(h, { rotulo: t("treino.kmCampo"), nome: "ckm", valor: "", attrs: { inputmode: "decimal" } });
  const fc = campo(h, { rotulo: t("treino.fcMedia"), nome: "cfc", valor: "", attrs: { inputmode: "numeric" } });
  const esf = selecionar(h, { rotulo: t("treino.esforco"), nome: "cesf", valor: "3", opcoes: [1, 2, 3, 4, 5].map((v) => ({ valor: String(v), texto: String(v) })) });
  return h("form", { id: "form-cardio", class: "form-crud", onsubmit: (e) => {
    e.preventDefault();
    const m = Number(min.input.value), k = km.input.value.trim() ? numeroDeTexto(km.input.value) : null, f = fc.input.value.trim() ? Number(fc.input.value) : null;
    if (!Number.isInteger(m) || m < 1 || (km.input.value.trim() && (k == null || k <= 0)) || (f != null && !Number.isInteger(f))) { salvar(() => { throw Object.assign(new Error("valor"), { erros: [{ codigo: "cardio.valor_invalido" }] }); }); return; }
    const item = { data: data.input.value, modalidade: mod.input.value, minutos: m, esforco: Number(esf.input.value), ...(k != null && temDistancia(mod.input.value) ? { km: k } : {}), ...(f != null ? { fcMedia: f } : {}) };
    salvar((x) => registrarCardio(x, item, { novoId: ctx.novoId, agora: ctx.agora }));
  } }, data, mod, min, km, fc, esf, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("treino.salvarCardio"))));
}
