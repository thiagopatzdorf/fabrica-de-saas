// Tela Corpo: composição (IMC, gordura, RCQ, RCE, massa magra, FFMI), tendência de peso, sono, hidratação, recuperação,
// fotos de progresso locais e relatório para levar ao médico. Toda conta vive em js/v2/corpo/ (pura, testada em Node);
// aqui só se agrupa e apresenta. Acompanhamento pessoal, não aconselhamento médico: nada de diagnóstico, de piso
// calórico ou de linguagem que envergonhe o corpo. Meio-termo à grega: faixas são referência, nunca nota.
import { adicionar, definir, editar } from "../../esquema.mjs";
import { dia } from "../../../datas.mjs";
import { composicaoCorporal } from "../../corpo/composicao.mjs";
import { alertasDePeso, projecao, ruidoDiario, taxaSemanal, tendenciaEma } from "../../corpo/tendencia.mjs";
import { dividaDeSono, duracaoHoras, faixaSono, horaDeMinutos, idadeEm, metaSonoHoras, minutosDeHora, noitesNaFaixa, pontoMedioMin, regularidade } from "../../corpo/sono.mjs";
import { BOTOES_ML, metaAguaMl, passouDoMeioTermo, progressoAgua } from "../../corpo/agua.mjs";
import { indiceRecuperacao } from "../../corpo/recuperacao.mjs";
import { bemestarDoDia, salvarBemestar, somarAgua } from "../../corpo/bemestar.mjs";
import { abrirFotos, reduzirImagem } from "../../corpo/fotos.mjs";
import { montarRelatorio } from "../../corpo/relatorio.mjs";
import { graficoColunas, graficoLinha } from "../graficos-patrimonio.mjs";
import { alternador, aviso, barra, baixar, campo, confirmar, estado, larguraGrafico, nota, numeroDeTexto, secao, selecionar, stat, tabelaIrma, ultimos, vazio } from "./_comum.mjs";

export const MEDIDAS = ["cinturaCm", "pescocoCm", "quadrilCm", "peitoCm", "bracoCm", "coxaCm"];

// ---------- lógica de apresentação pura (testada em Node) ----------
export const metaDePeso = (d) => d.metas.find((m) => m.tipo === "peso")?.alvo ?? null;

// Tudo que a seção de peso mostra, num objeto só: tendência atual, ritmo com faixa, projeção, ruído e avisos.
export function resumoDoPeso(d, hoje) {
  const pesos = d.pesos.filter((p) => p.data <= hoje), serie = tendenciaEma(pesos);
  if (!serie.length) return null;
  const ult = serie[serie.length - 1], taxa = taxaSemanal(pesos, hoje), meta = metaDePeso(d);
  return { serie, ult, taxa, meta, ruido: ruidoDiario(serie, hoje), proj: projecao({ atualKg: ult.tendencia, metaKg: meta, taxa, hoje }), alertas: alertasDePeso({ atualKg: ult.tendencia, metaKg: meta, alturaCm: d.perfil.alturaCm, taxa }) };
}

// Sono dos últimos 14 dias, do mais novo ao mais antigo, mais regularidade e "dívida" na janela de 7 dias.
export function resumoDoSono(d, hoje) {
  const ini = dia(hoje) - 13, noites = d.bemestar.filter((b) => b.sonoHoras != null && dia(b.data) >= ini && dia(b.data) <= dia(hoje));
  const meta = metaSonoHoras(d.perfil, hoje), idade = idadeEm(d.perfil.nascimento, hoje), faixa = faixaSono(idade);
  const pontos = d.bemestar.filter((b) => b.dormiuMin != null && b.acordouMin != null && dia(b.data) >= ini && dia(b.data) <= dia(hoje)).map((b) => pontoMedioMin(b.dormiuMin, b.acordouMin));
  return {
    noites, meta, idade, faixa, regularidade: regularidade(pontos), divida: dividaDeSono(d.bemestar, hoje, meta),
    media: noites.length ? Math.round((noites.reduce((s, b) => s + b.sonoHoras, 0) / noites.length) * 10) / 10 : null, naFaixa: noitesNaFaixa(noites, faixa),
  };
}

// Recuperação de um dia (índice + termos), pronta para a tela e para o relatório.
export const recuperacaoDeHoje = (d, hoje) => indiceRecuperacao({ bemestar: bemestarDoDia(d, hoje), treinos: d.treinos, hoje, metaSonoHoras: metaSonoHoras(d.perfil, hoje) });

// ---------- tela ----------
export const tela = {
  id: "corpo", titulo: "corpo.titulo", icone: "corpo", grupo: "mais", ordem: 75,
  css: ["/css/_telas.css", "/css/corpo.css"], i18n: "/js/v2/ui/telas/corpo.i18n.mjs",
  montar(ctx) {
    const { h, hs, t, fmt } = ctx;
    const raiz = h("div", { class: "tela-corpo" });
    const ui = { msg: null, dia: null, ultimaAgua: 0, fotos: [], fotosMsg: null, fotosOk: true, comparar: [null, null], urls: [], formMedida: false, formPerfil: false, formFoto: false };
    const armazemFotos = abrirFotos();
    const render = () => { for (const u of ui.urls) URL.revokeObjectURL(u); ui.urls = []; ctx.limpar(raiz); raiz.append(...conteudo()); };
    const salvar = (fn) => ctx.mudar(fn).then(() => { ui.msg = null; }).catch((e) => { ui.msg = t("corpo.erro", { codigo: (e?.erros ?? []).map((x) => x.codigo).join(", ") || String(e?.message ?? e) }); render(); });
    const kg = (v, c = 1) => `${fmt.numero(v, c)} kg`;
    const horas = (v) => { const m = Math.round(v * 60); return t("corpo.hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") }); };
    const diaAtual = () => ui.dia ?? ctx.hoje();
    const mudarDia = (v) => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { ui.dia = v; render(); } };

    function conteudo() {
      const d = ctx.estado(), hoje = ctx.hoje();
      const partes = [nota(h, t("corpo.aviso"), "corpo-aviso")];
      if (ui.msg) partes.push(aviso(h, ui.msg));
      partes.push(recuperacao(d, hoje), registroDoDia(d, hoje), agua(d, hoje), peso(d, hoje), composicao(d, hoje), fotos(), sono(d, hoje), relatorio(d, hoje));
      return partes;
    }

    // ---- recuperação ----
    function recuperacao(d, hoje) {
      const r = recuperacaoDeHoje(d, hoje);
      const partes = [];
      if (r.pontos == null) partes.push(vazio(h, t("corpo.rec.semDado")));
      else {
        partes.push(h("div", { class: "grade" }, stat(h, { rotulo: t("corpo.rec.indice"), valor: `${r.pontos} / 100`, sub: t(`corpo.rec.faixa.${r.faixa}`), classe: "st-rec" }),
          stat(h, { rotulo: t("corpo.rec.termosUsados"), valor: `${r.usados} / 4`, sub: t("corpo.rec.termosSub") })));
        partes.push(h("p", { class: "rec-sug" }, estado(h, { codigo: r.faixa === "boa" ? "ok" : "info", texto: t(`corpo.rec.sug.${r.faixa}`) })));
        if (r.avisoDor) partes.push(h("p", { class: "rec-dor" }, estado(h, { codigo: "atencao", texto: t("corpo.rec.avisoDor") })));
      }
      const linha = (x) => [t(`corpo.rec.termo.${x.id}`), x.valor == null ? t("corpo.rec.semDadoTermo") : `${fmt.numero(x.valor * 100, 0)}%`, String(x.peso), x.pontos == null ? "—" : fmt.numero(x.pontos, 1)];
      partes.push(tabelaIrma(h, { aberta: r.pontos != null, resumo: t("corpo.rec.contaResumo"), cabecalho: [t("corpo.rec.colTermo"), t("corpo.rec.colValor"), t("corpo.rec.colPeso"), t("corpo.rec.colPontos")], linhas: r.termos.map(linha) }));
      partes.push(nota(h, t("corpo.rec.como")), nota(h, r.carga ? t("corpo.rec.cargaInfo", { r: fmt.numero(r.carga.razao, 2) }) : t("corpo.rec.cargaSem")));
      return secao(h, t("corpo.rec.titulo"), "sec-rec", partes);
    }

    // ---- registro do dia: sono, energia e dor ----
    function registroDoDia(d, hoje) {
      const dd = diaAtual(), b = bemestarDoDia(d, dd);
      const data = campo(h, { rotulo: t("corpo.data"), nome: "bdata", tipo: "date", valor: dd, attrs: { required: true, max: hoje } });
      data.input.addEventListener("change", () => mudarDia(data.input.value));
      const dormiu = campo(h, { rotulo: t("corpo.dormiuAs"), nome: "bdormiu", tipo: "time", valor: b?.dormiuMin != null ? horaDeMinutos(b.dormiuMin) : "" });
      const acordou = campo(h, { rotulo: t("corpo.acordeiAs"), nome: "bacordou", tipo: "time", valor: b?.acordouMin != null ? horaDeMinutos(b.acordouMin) : "" });
      const horasC = campo(h, { rotulo: t("corpo.horasDormidas"), nome: "bhoras", valor: b?.sonoHoras != null ? String(b.sonoHoras).replace(".", fmt.idioma === "en" ? "." : ",") : "", attrs: { inputmode: "decimal", placeholder: "7,5" }, ajuda: t("corpo.horasAjuda") });
      const nivel = (nome, chave, atual) => selecionar(h, { rotulo: t(`corpo.${chave}`), nome, valor: atual ?? "", opcoes: [{ valor: "", texto: t("corpo.naoInformar") }, ...[1, 2, 3, 4, 5].map((n) => ({ valor: String(n), texto: t(`corpo.${chave}.${n}`) }))] });
      const qual = nivel("bqual", "qualidade", b?.sonoQualidade), ener = nivel("bener", "energia", b?.energia), dor = nivel("bdor", "dor", b?.dor);
      const form = h("form", { class: "form-crud corpo-form", onsubmit: (e) => {
        e.preventDefault();
        const dm = minutosDeHora(dormiu.input.value), am = minutosDeHora(acordou.input.value);
        const hTxt = horasC.input.value.trim(), hNum = hTxt ? numeroDeTexto(hTxt) : null;
        if ((hTxt && (hNum == null || hNum < 0 || hNum > 24)) || (dormiu.input.value && dm == null) || (acordou.input.value && am == null)) { ui.msg = t("corpo.valorInvalido"); return render(); }
        const porHorario = dm != null && am != null ? duracaoHoras(dm, am) : null;
        const num = (el) => (el.input.value === "" ? null : Number(el.input.value));
        const campos = { sonoHoras: hNum ?? porHorario, dormiuMin: dm, acordouMin: am, sonoQualidade: num(qual), energia: num(ener), dor: num(dor) };
        salvar((x) => salvarBemestar(x, data.input.value, campos, { novoId: ctx.novoId, agora: ctx.agora }));
      } }, data, dormiu, acordou, horasC, qual, ener, dor, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("corpo.salvarDia"))));
      return secao(h, t("corpo.dia.titulo"), "sec-dia", nota(h, t("corpo.dia.como")), form);
    }

    // ---- água ----
    function agua(d, hoje) {
      const dd = diaAtual(), b = bemestarDoDia(d, dd), ml = b?.aguaMl ?? 0;
      const kgRef = d.pesos.filter((p) => p.data <= hoje).slice(-1)[0]?.kg ?? null, meta = metaAguaMl(kgRef);
      const botoes = BOTOES_ML.map((n) => h("button", { type: "button", class: "peq", onclick: () => { ui.ultimaAgua = n; salvar((x) => somarAgua(x, dd, n, { novoId: ctx.novoId, agora: ctx.agora })); } }, t("corpo.agua.mais", { ml: n })));
      const desfazer = h("button", { type: "button", class: "peq", disabled: !ui.ultimaAgua || !ml, onclick: () => { const n = ui.ultimaAgua; ui.ultimaAgua = 0; salvar((x) => somarAgua(x, dd, -n, { novoId: ctx.novoId, agora: ctx.agora })); } }, t("corpo.agua.desfazer"));
      const exato = campo(h, { rotulo: t("corpo.agua.total"), nome: "aguaml", valor: ml ? String(ml) : "", attrs: { inputmode: "numeric" } });
      const formExato = h("form", { class: "form-crud", onsubmit: (e) => { e.preventDefault(); const n = exato.input.value.trim() === "" ? 0 : Number(exato.input.value); if (!Number.isInteger(n) || n < 0 || n > 20000) { ui.msg = t("corpo.valorInvalido"); return render(); } ui.ultimaAgua = 0; salvar((x) => salvarBemestar(x, dd, { aguaMl: n }, { novoId: ctx.novoId, agora: ctx.agora })); } }, exato, h("div", { class: "botoes" }, h("button", { type: "submit", class: "peq" }, t("corpo.agua.ajustar"))));
      return secao(h, t("corpo.agua.titulo"), "sec-agua",
        h("div", { class: "grade" }, stat(h, { rotulo: t("corpo.agua.hoje", { data: fmt.dataCurta(dd) }), valor: `${fmt.numero(ml)} ml`, sub: t("corpo.agua.deMeta", { meta: fmt.numero(meta.ml) }) })),
        barra(h, { fracao: progressoAgua(ml, meta.ml), rotulo: t("corpo.agua.progresso") }),
        h("div", { class: "botoes" }, botoes, desfazer), formExato,
        nota(h, meta.padrao ? t("corpo.agua.metaPadrao") : t("corpo.agua.metaPeso", { kg: fmt.numero(kgRef, 1), meta: fmt.numero(meta.ml) })),
        passouDoMeioTermo(ml, meta.ml) ? h("p", null, estado(h, { codigo: "info", texto: t("corpo.agua.meioTermo") })) : null, nota(h, t("corpo.agua.ressalva")));
    }

    // ---- peso e tendência ----
    function peso(d, hoje) {
      const r = resumoDoPeso(d, hoje), partes = [];
      if (!r) partes.push(vazio(h, t("corpo.peso.semPesagens")));
      else {
        const taxa = r.taxa;
        const dif = r.ult.kg - r.ult.tendencia;
        partes.push(h("div", { class: "grade" },
          stat(h, { rotulo: t("corpo.peso.tendencia"), valor: kg(r.ult.tendencia), sub: t("corpo.peso.tendenciaSub") }),
          stat(h, { rotulo: t("corpo.peso.ultimo"), valor: kg(r.ult.kg), sub: t("corpo.peso.ultimoSub", { data: fmt.data(r.ult.data), dif: `${dif > 0 ? "+" : dif < 0 ? "−" : ""}${fmt.numero(Math.abs(dif), 1)}` }) }),
          stat(h, { rotulo: t("corpo.peso.ritmo"), valor: taxa ? `${taxa.kgPorSemana > 0 ? "+" : taxa.kgPorSemana < 0 ? "−" : ""}${fmt.numero(Math.abs(taxa.kgPorSemana), 2)}` : "—", sub: taxa ? t("corpo.peso.ritmoFaixa", { margem: fmt.numero(taxa.margem, 2), n: taxa.pontos }) : t("corpo.peso.ritmoPrecisa") }),
          stat(h, { rotulo: t("corpo.peso.ruido"), valor: r.ruido != null ? `± ${fmt.numero(r.ruido, 1)} kg` : "—", sub: t("corpo.peso.ruidoSub") })));
        partes.push(h("p", { class: "peso-proj" }, estado(h, { codigo: r.proj.estado === "ok" || r.proj.estado === "na_meta" ? "ok" : "info", texto: textoProjecao(r) })));
        for (const a of r.alertas) partes.push(h("p", { class: "peso-alerta" }, estado(h, { codigo: "atencao", texto: t(`corpo.peso.alerta.${a}`) })));
        const ult = ultimos(r.serie, 60);
        const svg = graficoLinha({ hs, largura: larguraGrafico(), titulo: t("corpo.peso.grafico"), desc: t("corpo.peso.graficoDesc", { n: ult.length }), pontos: ult.map((p) => ({ x: dia(p.data), y: p.kg, tip: `${fmt.data(p.data)}: ${kg(p.kg)}` })), media: ult.map((p) => ({ x: dia(p.data), y: p.tendencia })), meta: r.meta, rotuloMeta: t("corpo.peso.meta"), fmtY: (v) => fmt.numero(v, 0), xRotulos: ult.length > 1 ? [ult[0], ult[ult.length - 1]].map((p) => ({ x: dia(p.data), texto: fmt.dataCurta(p.data) })) : [] });
        partes.push(h("div", { class: "graf" }, svg), h("ul", { class: "legenda" }, h("li", null, h("i", { class: "q s1" }), t("corpo.peso.legPontos")), h("li", null, h("i", { class: "q s3" }), t("corpo.peso.legTendencia"))),
          tabelaIrma(h, { resumo: t("corpo.verTabela"), cabecalho: [t("corpo.data"), t("corpo.peso.colPeso"), t("corpo.peso.colTendencia")], linhas: ult.slice().reverse().map((p) => [fmt.data(p.data), fmt.numero(p.kg, 1), fmt.numero(p.tendencia, 1)]) }));
      }
      partes.push(nota(h, t("corpo.peso.como")), r?.meta == null ? nota(h, t("corpo.peso.semMeta")) : null);
      const data = campo(h, { rotulo: t("corpo.data"), nome: "wdata", tipo: "date", valor: hoje, attrs: { required: true, max: hoje } });
      const v = campo(h, { rotulo: t("corpo.peso.kg"), nome: "wkg", valor: "", attrs: { inputmode: "decimal", required: true, placeholder: "80,5" } });
      partes.push(h("form", { class: "form-crud corpo-form", onsubmit: (e) => { e.preventDefault(); const n = numeroDeTexto(v.input.value); if (n == null || n < 20 || n > 500) { ui.msg = t("corpo.peso.foraDaFaixa"); return render(); } salvar((x) => { const ja = x.pesos.find((p) => p.data === data.input.value); return ja ? editar(x, "pesos", ja.id, { kg: n }, { agora: ctx.agora }) : adicionar(x, "pesos", { data: data.input.value, kg: n }, { novoId: ctx.novoId, agora: ctx.agora }); }); } }, data, v, h("div", { class: "botoes" }, h("button", { type: "submit" }, t("corpo.peso.registrar")))));
      return secao(h, t("corpo.peso.titulo"), "sec-peso", partes);
    }
    function textoProjecao(r) {
      const p = r.proj;
      if (p.estado === "na_meta") return t("corpo.peso.proj.naMeta");
      if (p.estado === "ok") return t("corpo.peso.proj.ok", { central: p.semanas.central, min: p.semanas.min, max: p.semanas.max, data: fmt.data(p.data), meta: kg(r.meta) });
      if (p.estado === "alem_3_anos") return t("corpo.peso.proj.longe");
      if (p.estado === "incerta") return t("corpo.peso.proj.incerta");
      if (p.estado === "sem_direcao") return t("corpo.peso.proj.semDirecao");
      return r.meta == null ? t("corpo.peso.proj.semMeta") : t("corpo.peso.proj.semDados");
    }

    // ---- composição ----
    function composicao(d, hoje) {
      const c = composicaoCorporal(d, hoje), partes = [];
      const faixa = (pref, cod) => (cod ? t(`corpo.${pref}.${cod}`) : null);
      const g = c.gordura != null ? `${fmt.numero(c.gordura, 1)}%` : "—";
      partes.push(h("div", { class: "grade" },
        stat(h, { rotulo: t("corpo.comp.imc"), valor: c.imc != null ? fmt.numero(c.imc, 1) : "—", sub: faixa("imcFaixa", c.imcFaixa) ?? t("corpo.comp.precisaAltura") }),
        stat(h, { rotulo: t("corpo.comp.gordura"), valor: g, sub: faixa("gorduraFaixa", c.gorduraFaixa) ?? (c.faltaPerfil ? t("corpo.comp.precisaPerfil") : t("corpo.comp.precisaMedidas", { extra: d.perfil.sexo === "f" ? t("corpo.comp.extraF") : "" })) }),
        stat(h, { rotulo: t("corpo.comp.rcq"), valor: c.rcq != null ? fmt.numero(c.rcq, 2) : "—", sub: faixa("rcqFaixa", c.rcqFaixa) ?? t("corpo.comp.precisaQuadril") }),
        stat(h, { rotulo: t("corpo.comp.rce"), valor: c.rce != null ? fmt.numero(c.rce, 2) : "—", sub: faixa("rceFaixa", c.rceFaixa) ?? t("corpo.comp.precisaCintura") }),
        stat(h, { rotulo: t("corpo.comp.massaMagra"), valor: c.massaMagraKg != null ? kg(c.massaMagraKg) : "—", sub: c.massaMagraKg != null ? t("corpo.comp.massaMagraSub") : t("corpo.comp.precisaGordura") }),
        stat(h, { rotulo: t("corpo.comp.ffmi"), valor: c.ffmiNorm != null ? fmt.numero(c.ffmiNorm, 1) : "—", sub: c.ffmiNorm != null ? (faixa("ffmiFaixa", c.ffmiFaixa) ?? t("corpo.comp.ffmiSemRef")) : t("corpo.comp.precisaGordura") })));
      if (c.pesoNaFaixa) partes.push(nota(h, t("corpo.comp.pesoNaFaixa", { min: fmt.numero(c.pesoNaFaixa.minKg, 1), max: fmt.numero(c.pesoNaFaixa.maxKg, 1) })));
      if (c.dataMedidas) partes.push(nota(h, t("corpo.comp.dasMedidas", { data: fmt.data(c.dataMedidas) })));
      partes.push(h("details", { class: "tab" }, h("summary", null, t("corpo.comp.limites")), h("ul", { class: "lista-simples corpo-fontes" }, ["imc", "gordura", "rcq", "rce", "massaMagra", "ffmi"].map((k) => h("li", null, h("b", null, t(`corpo.comp.${k}`)), ` ${t(`corpo.comp.lim.${k}`)}`)))));
      const medida = formMedida(hoje), perfil = formPerfil(d);
      partes.push(h("div", { class: "botoes" }, alternador(h, { texto: t("corpo.comp.novaMedicao"), alvo: medida, aberto: ui.formMedida }), alternador(h, { texto: t("corpo.comp.perfil"), alvo: perfil, aberto: ui.formPerfil || c.faltaPerfil })), medida, perfil);
      return secao(h, t("corpo.comp.titulo"), "sec-comp", partes);
    }
    function formMedida(hoje) {
      const data = campo(h, { rotulo: t("corpo.data"), nome: "mdata", tipo: "date", valor: hoje, attrs: { required: true, max: hoje } });
      const cs = MEDIDAS.map((k) => campo(h, { rotulo: `${t(`corpo.medida.${k}`)} (cm)`, nome: `m-${k}`, valor: "", attrs: { inputmode: "decimal" } }));
      return h("form", { id: "form-medida-corpo", class: "form-crud", onsubmit: (e) => { e.preventDefault(); const item = { data: data.input.value }; MEDIDAS.forEach((k, i) => { const n = numeroDeTexto(cs[i].input.value); if (n != null) item[k] = n; }); if (Object.keys(item).length < 2) { ui.msg = t("corpo.umaMedida"); return render(); } salvar((x) => adicionar(x, "medidas", item, { novoId: ctx.novoId, agora: ctx.agora })); } },
        h("h3", null, t("corpo.comp.novaMedicao")), data, cs, nota(h, t("corpo.comp.comoMedir")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("corpo.comp.salvarMedidas"))));
    }
    function formPerfil(d) {
      const sexo = selecionar(h, { rotulo: t("corpo.sexo"), nome: "psexo", valor: d.perfil.sexo, opcoes: [{ valor: "", texto: t("corpo.sexoNao") }, { valor: "m", texto: t("corpo.sexoM") }, { valor: "f", texto: t("corpo.sexoF") }] });
      const alt = campo(h, { rotulo: t("corpo.altura"), nome: "palt", valor: d.perfil.alturaCm ?? "", attrs: { inputmode: "decimal" } });
      const nasc = campo(h, { rotulo: t("corpo.nascimento"), nome: "pnasc", tipo: "date", valor: d.perfil.nascimento ?? "" });
      const meta = campo(h, { rotulo: t("corpo.metaSono"), nome: "pmetasono", valor: d.perfil.metaSonoHoras ?? "", attrs: { inputmode: "decimal" }, ajuda: t("corpo.metaSonoAjuda") });
      return h("form", { id: "form-perfil-corpo", class: "form-crud", onsubmit: (e) => { e.preventDefault();
        const a = alt.input.value.trim() ? numeroDeTexto(alt.input.value) : null, m = meta.input.value.trim() ? numeroDeTexto(meta.input.value) : null;
        if ((alt.input.value.trim() && a == null) || (meta.input.value.trim() && (m == null || m < 4 || m > 12))) { ui.msg = t("corpo.valorInvalido"); return render(); }
        ui.formPerfil = false; salvar((x) => definir(x, "perfil", { sexo: sexo.input.value, alturaCm: a, nascimento: nasc.input.value || null, metaSonoHoras: m }, { agora: ctx.agora })); } },
        h("h3", null, t("corpo.comp.perfil")), sexo, alt, nasc, meta, nota(h, t("corpo.perfilNota")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("corpo.salvar"))));
    }

    // ---- fotos de progresso (só neste aparelho) ----
    function fotos() {
      const partes = [nota(h, t("corpo.fotos.privacidade"))];
      if (!armazemFotos || !ui.fotosOk) return secao(h, t("corpo.fotos.titulo"), "sec-fotos", partes, vazio(h, t("corpo.fotos.indisponivel")));
      if (ui.fotosMsg) partes.push(aviso(h, ui.fotosMsg));
      const form = formFoto();
      partes.push(h("div", { class: "botoes" }, alternador(h, { texto: t("corpo.fotos.adicionar"), alvo: form, aberto: ui.formFoto })), form);
      if (!ui.fotos.length) partes.push(vazio(h, t("corpo.fotos.vazio")));
      else {
        const url = (f) => { const u = URL.createObjectURL(f.blob); ui.urls.push(u); return u; };
        const rotulo = (f) => `${fmt.data(f.data)}${f.nota ? ` · ${f.nota}` : ""}`;
        partes.push(h("ul", { class: "fotos-grade" }, ui.fotos.map((f) => h("li", { class: "foto" }, h("img", { src: url(f), alt: t("corpo.fotos.alt", { data: fmt.data(f.data) }), loading: "lazy" }), h("span", null, rotulo(f)),
          h("button", { type: "button", class: "peq", "aria-label": t("corpo.fotos.apagarX", { data: fmt.data(f.data) }), onclick: async () => { if (await confirmar(h, raiz, { titulo: t("corpo.fotos.apagarX", { data: fmt.data(f.data) }), texto: t("corpo.fotos.apagarTexto"), ok: t("corpo.apagar"), cancelar: t("corpo.cancelar") })) { await armazemFotos.remover(f.id); await recarregarFotos(); } } }, t("corpo.apagar"))))));
        if (ui.fotos.length >= 2) {
          const ops = ui.fotos.map((f) => ({ valor: f.id, texto: rotulo(f) }));
          const a = ui.fotos.find((f) => f.id === ui.comparar[0]) ?? ui.fotos[0], b = ui.fotos.find((f) => f.id === ui.comparar[1]) ?? ui.fotos[ui.fotos.length - 1];
          const sa = selecionar(h, { rotulo: t("corpo.fotos.antes"), nome: "fotoa", valor: a.id, opcoes: ops }), sb = selecionar(h, { rotulo: t("corpo.fotos.depois"), nome: "fotob", valor: b.id, opcoes: ops });
          const troca = () => { ui.comparar = [sa.input.value, sb.input.value]; render(); };
          sa.input.addEventListener("change", troca); sb.input.addEventListener("change", troca);
          partes.push(h("h3", null, t("corpo.fotos.comparar")), h("div", { class: "foto-seletores" }, sa, sb),
            h("div", { class: "foto-lado" }, [a, b].map((f, i) => h("figure", null, h("img", { src: url(f), alt: t("corpo.fotos.alt", { data: fmt.data(f.data) }) }), h("figcaption", null, `${t(i ? "corpo.fotos.depois" : "corpo.fotos.antes")}: ${rotulo(f)}`)))));
        }
      }
      return secao(h, t("corpo.fotos.titulo"), "sec-fotos", partes);
    }
    function formFoto() {
      const arquivo = campo(h, { rotulo: t("corpo.fotos.arquivo"), nome: "fotoarq", tipo: "file", valor: "", attrs: { accept: "image/*" } });
      const data = campo(h, { rotulo: t("corpo.data"), nome: "fotodata", tipo: "date", valor: ctx.hoje(), attrs: { required: true, max: ctx.hoje() } });
      const obs = campo(h, { rotulo: t("corpo.fotos.nota"), nome: "fotonota", valor: "", attrs: { maxlength: "60" } });
      return h("form", { id: "form-foto", class: "form-crud", onsubmit: async (e) => {
        e.preventDefault();
        const arq = arquivo.input.files?.[0];
        if (!arq) { ui.fotosMsg = t("corpo.fotos.escolha"); return render(); }
        try {
          const blob = await reduzirImagem(arq);
          await armazemFotos.adicionar({ id: ctx.novoId(), data: data.input.value, nota: obs.input.value.trim(), blob });
          ui.fotosMsg = null; ui.formFoto = false; await recarregarFotos();
        } catch { ui.fotosMsg = t("corpo.fotos.erro"); render(); }
      } }, h("h3", null, t("corpo.fotos.adicionar")), arquivo, data, obs, nota(h, t("corpo.fotos.reduz")), h("div", { class: "botoes" }, h("button", { type: "submit" }, t("corpo.fotos.guardar"))));
    }
    async function recarregarFotos() { try { ui.fotos = await armazemFotos.listar(); } catch { ui.fotosOk = false; } render(); }

    // ---- sono ----
    function sono(d, hoje) {
      const s = resumoDoSono(d, hoje), partes = [];
      const reg = s.regularidade, div = s.divida;
      partes.push(h("div", { class: "grade" },
        stat(h, { rotulo: t("corpo.sono.media"), valor: s.media != null ? horas(s.media) : "—", sub: s.noites.length ? t("corpo.sono.mediaSub", { n: s.noites.length, meta: horas(s.meta) }) : t("corpo.sono.semNoites") }),
        stat(h, { rotulo: t("corpo.sono.naFaixa"), valor: s.noites.length ? `${s.naFaixa} / ${s.noites.length}` : "—", sub: t("corpo.sono.naFaixaSub", { min: s.faixa.min, max: s.faixa.max }) }),
        stat(h, { rotulo: t("corpo.sono.regularidade"), valor: reg ? t("corpo.sono.minutos", { n: fmt.numero(reg.desvioMin, 0) }) : "—", sub: reg ? t(`corpo.sono.reg.${reg.faixa}`) : t("corpo.sono.regPrecisa") }),
        stat(h, { rotulo: t("corpo.sono.divida"), valor: div ? horas(div.deficitHoras) : "—", sub: div ? t("corpo.sono.dividaSub", { n: div.noites }) : t("corpo.sono.dividaPrecisa") })));
      partes.push(nota(h, s.idade == null ? t("corpo.sono.faixaPresumida", { min: s.faixa.min, max: s.faixa.max }) : t("corpo.sono.faixaIdade", { idade: s.idade, min: s.faixa.min, max: s.faixa.max })));
      if (s.noites.length) {
        const ord = s.noites.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
        const svg = graficoColunas({ hs, largura: larguraGrafico(), titulo: t("corpo.sono.grafico"), desc: t("corpo.sono.graficoDesc", { n: ord.length }), grupos: ord.map((b) => ({ rotulo: fmt.dataCurta(b.data), valor: b.sonoHoras, tip: `${fmt.data(b.data)}: ${horas(b.sonoHoras)}` })), meta: s.meta, rotuloMeta: t("corpo.sono.meta"), fmtY: (v) => fmt.numero(v, 0), classe: "s3" });
        partes.push(h("div", { class: "graf" }, svg), tabelaIrma(h, { resumo: t("corpo.verTabela"), cabecalho: [t("corpo.data"), t("corpo.sono.colHoras"), t("corpo.sono.colQualidade")], linhas: ord.slice().reverse().map((b) => [fmt.data(b.data), horas(b.sonoHoras), b.sonoQualidade != null ? `${b.sonoQualidade}/5` : "—"]) }));
      }
      partes.push(nota(h, t("corpo.sono.como")));
      return secao(h, t("corpo.sono.titulo"), "sec-sono", partes);
    }

    // ---- relatório ----
    function relatorio(d, hoje) {
      const html = () => montarRelatorio(d, hoje, { t, fmt, idioma: fmt.idioma });
      const baixarBtn = h("button", { type: "button", onclick: () => baixar(document, `fitrich-corpo-${hoje}.html`, html(), "text/html") }, t("corpo.rel.baixar"));
      const abrir = h("button", { type: "button", class: "peq", onclick: () => { const u = URL.createObjectURL(new Blob([html()], { type: "text/html" })); window.open(u, "_blank", "noopener"); setTimeout(() => URL.revokeObjectURL(u), 60000); } }, t("corpo.rel.abrir"));
      return secao(h, t("corpo.rel.titulo"), "sec-rel", nota(h, t("corpo.rel.como")), h("div", { class: "botoes" }, baixarBtn, abrir), nota(h, t("corpo.rel.privacidade")));
    }

    render();
    if (armazemFotos) recarregarFotos();
    return { elemento: raiz, atualizar: render, destruir() { for (const u of ui.urls) URL.revokeObjectURL(u); } };
  },
};
