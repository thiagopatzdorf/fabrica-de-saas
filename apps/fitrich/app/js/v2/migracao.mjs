// Migração entre versões do Fitrich, em cadeia e pura: `migrar(d)` aplica [{de, para, fn}] até VERSAO.
// Nada aqui grava em lugar nenhum (quem grava é o armazém); por isso dá para testar a mesma função
// mil vezes e para provar as invariantes (mesma contagem, mesma soma de centavos) antes de confiar.
import { validar as validarV1 } from "../dados.mjs";
import { hojeISO } from "../datas.mjs";
import { CATEGORIAS_PADRAO, COLECOES, VERSAO, agoraPadrao, ordenar, validar, vazio } from "./esquema.mjs";

export const CONTA_V1_ID = "v1-conta-1";
// Nome de categoria da v1 (por tipo) → id fixo da v2. Mapa fechado: a v1 só aceitava estes nomes.
export const MAPA_CATEGORIAS_V1 = {
  despesa: { Moradia: "cat-moradia", Mercado: "cat-mercado", Transporte: "cat-transporte", "Saúde e fitness": "cat-saude-fitness", Lazer: "cat-lazer", Educação: "cat-educacao", Outros: "cat-outros" },
  receita: { Salário: "cat-salario", Extra: "cat-extra", Outros: "cat-outros-receita" },
};
// Ids inteiros da v1 viram strings estáveis: rodar a migração duas vezes dá o mesmo id, e o merge
// por arquivo (área 5) reconhece o mesmo registro vindo de dois aparelhos que migraram a mesma v1.
export const idV1 = (colecao, n) => `v1-${colecao}-${n}`;

function deV1ParaV2(d1, { agora }) {
  const t = agora(), hoje = hojeISO(new Date(t));
  const d = vazio({ agora: () => t });
  const comId = (colecao) => d1[colecao].map((x) => ({ ...x, id: idV1(colecao, x.id) }));
  d.perfil = { ...d.perfil, sexo: d1.perfil.sexo, alturaCm: d1.perfil.alturaCm };
  // O saldo inicial vale no início de `dataSaldoInicial`: a carteira nasce zerada no dia do primeiro lançamento
  // (ou hoje, sem lançamentos), para todo lançamento antigo contar no saldo.
  const datas = d1.lancamentos.map((l) => l.data).sort();
  d.contas = [{ id: CONTA_V1_ID, nome: "Carteira", tipo: "dinheiro", moeda: "BRL", saldoInicialCentavos: 0, dataSaldoInicial: datas[0] ?? hoje, arquivada: false }];
  d.lancamentos = d1.lancamentos.map((l) => ({
    id: idV1("lancamentos", l.id), data: l.data, tipo: l.tipo, centavos: l.centavos, categoriaId: MAPA_CATEGORIAS_V1[l.tipo][l.categoria],
    descricao: l.descricao ?? "", tags: [], contaId: CONTA_V1_ID, meio: "outro", moeda: "BRL", status: "efetivado", origem: "manual", atualizadoEm: t,
  }));
  d.pesos = comId("pesos"); d.medidas = comId("medidas"); d.treinos = comId("treinos");
  d.orcamento = { metodo: "limites", rollover: false, limites: Object.fromEntries(Object.entries(d1.orcamento).map(([nome, c]) => [MAPA_CATEGORIAS_V1.despesa[nome], c])) };
  const m = d1.metas, metas = [];
  if (m.pesoKg != null) metas.push({ id: "v1-metas-peso", nome: "Peso", tipo: "peso", alvo: m.pesoKg });
  metas.push({ id: "v1-metas-treino", nome: "Treinos por semana", tipo: "treino", alvo: m.treinosSemana });
  metas.push({ id: "v1-metas-poupanca", nome: "Taxa de poupança", tipo: "poupanca", alvo: m.poupancaPct });
  if (m.reservaAlvo != null) metas.push({ id: "v1-metas-reserva", nome: "Reserva de emergência", tipo: "reserva", alvo: m.reservaAlvo, atual: m.reservaAtual ?? 0 });
  d.metas = metas;
  d.meta = { ...d.meta, migradoDeV1Em: t };
  for (const c of COLECOES) d[c] = ordenar(c, d[c]);
  return d;
}

export const CADEIA = [{ de: 1, para: 2, fn: deV1ParaV2 }];

// Resultado: { ok, dados, passos } ou { ok:false, erros:[{codigo, caminho}] }. Dados já na versão atual passam direto.
export function migrar(dados, { agora = agoraPadrao } = {}) {
  if (!dados || typeof dados !== "object") return { ok: false, erros: [{ codigo: "dados.nao_objeto", caminho: "" }] };
  let d = dados, passos = 0;
  if (!Number.isInteger(d.versao) || d.versao < 1) return { ok: false, erros: [{ codigo: "migracao.versao_desconhecida", caminho: "versao" }] };
  if (d.versao > VERSAO) return { ok: false, erros: [{ codigo: "migracao.versao_futura", caminho: "versao" }] };
  if (d.versao === 1) { const v = validarV1(d); if (!v.ok) return { ok: false, erros: v.erros.map((frase) => ({ codigo: "migracao.v1_invalida", caminho: "", detalhe: frase })) }; }
  while (d.versao < VERSAO) {
    const passo = CADEIA.find((p) => p.de === d.versao);
    if (!passo) return { ok: false, erros: [{ codigo: "migracao.sem_caminho", caminho: `versao=${d.versao}` }] };
    try { d = passo.fn(d, { agora }); } catch { return { ok: false, erros: [{ codigo: "migracao.passo_falhou", caminho: `${passo.de}->${passo.para}` }] }; }
    if (d.versao !== passo.para) return { ok: false, erros: [{ codigo: "migracao.passo_nao_avancou", caminho: `${passo.de}->${passo.para}` }] };
    passos++;
  }
  // Mudança ADITIVA do esquema (coleção nova, ex.: `bemestar`): backup da mesma versão sem ela continua valendo,
  // a coleção que falta entra vazia. Sem isso, todo backup antigo seria recusado por "colecao.nao_lista".
  d = { ...d, ...Object.fromEntries(COLECOES.filter((c) => d[c] === undefined).map((c) => [c, []])) };
  const v = validar(d);
  return v.ok ? { ok: true, dados: d, passos } : { ok: false, erros: [{ codigo: "migracao.resultado_invalido", caminho: "" }, ...v.erros] };
}

// Contagem por coleção e soma de centavos dos lançamentos: a assinatura que tem de bater antes e depois.
// Serve tanto para v1 quanto para v2 (as coleções que a v1 não tinha contam 0).
export function assinatura(d) {
  const contagens = {};
  for (const c of COLECOES) contagens[c] = Array.isArray(d?.[c]) ? d[c].length : 0;
  const soma = (tipo) => (d?.lancamentos ?? []).filter((l) => l.tipo === tipo).reduce((s, l) => s + l.centavos, 0);
  return { contagens, somaReceitas: soma("receita"), somaDespesas: soma("despesa") };
}

// Compara v1 e o que foi gravado: só as coleções que existiam na v1 (a v2 cria conta, categorias e metas por desenho).
export const COLECOES_V1 = ["pesos", "medidas", "treinos", "lancamentos"];
export function conferirMigracao(v1, v2) {
  const a = assinatura(v1), b = assinatura(v2), divergencias = [];
  for (const c of COLECOES_V1) if (a.contagens[c] !== b.contagens[c]) divergencias.push({ codigo: "migracao.contagem_divergente", caminho: c, antes: a.contagens[c], depois: b.contagens[c] });
  if (a.somaReceitas !== b.somaReceitas) divergencias.push({ codigo: "migracao.soma_divergente", caminho: "receitas", antes: a.somaReceitas, depois: b.somaReceitas });
  if (a.somaDespesas !== b.somaDespesas) divergencias.push({ codigo: "migracao.soma_divergente", caminho: "despesas", antes: a.somaDespesas, depois: b.somaDespesas });
  return { ok: divergencias.length === 0, divergencias };
}

// Importa um backup de QUALQUER versão até a atual: um JSON de 2026 tem de abrir em 2030.
export function importarJSON(texto, { agora = agoraPadrao } = {}) {
  let d;
  try { d = JSON.parse(texto); } catch { return { ok: false, erros: [{ codigo: "dados.json_invalido", caminho: "" }] }; }
  return migrar(d, { agora });
}

export { CATEGORIAS_PADRAO };
