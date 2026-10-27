// Esquema v2 do Fitrich: a forma dos dados, as regras que os validam e o CRUD imutável.
// Nada aqui toca DOM, relógio nem aleatório: `novoId` e `agora` são injetados (padrões abaixo).
// Erros são CÓDIGOS (`lancamento.categoria_inexistente`), nunca frases: o texto é da camada de UI.
// Desenho e justificativas: docs/plano-v2.md ("Schema v2").
import { ehISO, mesDe } from "../datas.mjs";
import { EQUIPAMENTOS, GRUPOS as GRUPOS_MUSCULARES, MODALIDADES, PADROES } from "./treino/constantes.mjs";

export const VERSAO = 2;
export const COLECOES = ["contas", "cartoes", "categorias", "lancamentos", "recorrencias", "faturas", "metas", "dividas", "investimentos", "regras", "importacoes", "pesos", "medidas", "treinos", "snapshots", "bemestar", "refeicoes", "exercicios", "rotinas", "sessoes", "cardio"];
// Coleções cuja ordem natural é a data: adicionar/editar as mantêm ordenadas (como na v1).
const POR_DATA = new Set(["lancamentos", "pesos", "medidas", "treinos", "bemestar", "refeicoes", "sessoes", "cardio"]);
// Coleções que bancos gravados antes de existirem podem não ter: ausente vale lista vazia.
const OPCIONAIS = new Set(["bemestar", "refeicoes", "exercicios", "rotinas", "sessoes", "cardio"]);
export const TIPOS_TREINO = ["Musculação", "Corrida", "Caminhada", "Bicicleta", "Esporte", "Outro"];
export const TIPOS_CONTA = ["corrente", "poupanca", "dinheiro", "investimento"];
export const TIPOS_LANCAMENTO = ["receita", "despesa", "transferencia", "estorno"];
export const MEIOS = ["pix", "boleto", "debito", "credito", "dinheiro", "outro"];
export const GRUPOS = ["necessidade", "desejo", "poupanca"];
export const TIPOS_META = ["reserva", "sinking", "objetivo", "independencia", "poupanca", "treino", "peso"];
export const METODOS_ORCAMENTO = ["limites", "envelopes", "503020"];
// Nutrição (espelho dos valores de nutricao/energia.mjs e nutricao/diario.mjs; um teste confere que não divergem).
export const REFEICOES_NUTRICAO = ["cafe", "almoco", "lanche", "jantar", "ceia", "agua"];
export const NIVEIS_ATIVIDADE = ["sedentario", "leve", "moderado", "alto", "muito_alto"];
export const OBJETIVOS_NUTRICAO = ["manter", "perder", "ganhar"];
export const CATEGORIA_FITNESS_ID = "cat-saude-fitness";
// Chave de `resumoMes().porCategoria` para despesa importada ainda sem categoria (a UI mostra "Sem categoria").
export const SEM_CATEGORIA = "sem-categoria";

// UUID v4. `crypto.randomUUID` quando existe; senão monta a partir de getRandomValues ou Math.random
// (o fallback existe para ser testável e para navegadores velhos, não por preferência).
export function novoIdPadrao(cripto = globalThis.crypto) {
  if (cripto && typeof cripto.randomUUID === "function") return cripto.randomUUID();
  return uuidV4Fallback(cripto);
}
export function uuidV4Fallback(cripto, aleatorio = Math.random) {
  const b = new Uint8Array(16);
  if (cripto && typeof cripto.getRandomValues === "function") cripto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(aleatorio() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const agoraPadrao = () => new Date().toISOString();

// Categorias padrão BR com id FIXO (slug): a migração v1→v2 e o cruzamento shape×finanças (Saúde e fitness)
// precisam apontar para elas sem adivinhar. Categoria criada pela pessoa recebe UUID.
// `essencial` alimenta a reserva de emergência (meses de despesa essencial); `grupo` alimenta o 50/30/20.
// Dívidas entram no grupo "poupanca": no 50/30/20 pagar dívida além do mínimo conta como os 20%.
const CAT = (id, nome, tipo, essencial, grupo) => ({ id, nome, tipo, essencial, grupo });
export const CATEGORIAS_PADRAO = [
  CAT("cat-moradia", "Moradia", "despesa", true, "necessidade"),
  CAT("cat-mercado", "Mercado", "despesa", true, "necessidade"),
  CAT("cat-transporte", "Transporte", "despesa", true, "necessidade"),
  CAT("cat-saude-fitness", "Saúde e fitness", "despesa", true, "necessidade"),
  CAT("cat-educacao", "Educação", "despesa", true, "necessidade"),
  CAT("cat-impostos", "Impostos e taxas", "despesa", true, "necessidade"),
  CAT("cat-pet", "Pet", "despesa", true, "necessidade"),
  CAT("cat-dividas", "Dívidas e empréstimos", "despesa", true, "poupanca"),
  CAT("cat-lazer", "Lazer", "despesa", false, "desejo"),
  CAT("cat-delivery", "Delivery e restaurante", "despesa", false, "desejo"),
  CAT("cat-assinaturas", "Assinaturas", "despesa", false, "desejo"),
  CAT("cat-vestuario", "Vestuário", "despesa", false, "desejo"),
  CAT("cat-outros", "Outros", "despesa", false, "desejo"),
  CAT("cat-salario", "Salário", "receita", false, null),
  CAT("cat-extra", "Extra", "receita", false, null),
  CAT("cat-rendimentos", "Rendimentos", "receita", false, null),
  CAT("cat-outros-receita", "Outros", "receita", false, null),
];

export function vazio({ agora = agoraPadrao } = {}) {
  const t = agora();
  const d = {
    versao: VERSAO,
    meta: { criadoEm: t, atualizadoEm: t, ultimoBackupEm: null, removidos: [] },
    perfil: { sexo: "", alturaCm: null, idioma: "pt-BR", moedaPadrao: "BRL" },
    orcamento: { metodo: "limites", rollover: false, limites: {} },
  };
  for (const c of COLECOES) d[c] = [];
  d.categorias = CATEGORIAS_PADRAO.map((c) => ({ ...c }));
  return d;
}

// ---------- validação ----------
const numero = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const inteiro = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const vazioOu = (v, f) => v === null || v === undefined || f(v);
const texto = (v, max = 200) => typeof v === "string" && v.length <= max;
const textoCheio = (v, max = 200) => texto(v, max) && v.trim().length > 0;
const idOk = (v) => typeof v === "string" && v.length >= 1 && v.length <= 80;
const ehYM = (v) => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const ehMoeda = (v) => typeof v === "string" && /^[A-Z]{3}$/.test(v);
const ehInstante = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const bool = (v) => typeof v === "boolean";
const MAX_CENTAVOS = 1e13;

export class ErroEsquema extends Error {
  constructor(erros) { super(erros.map((e) => e.codigo).join(", ")); this.name = "ErroEsquema"; this.erros = erros; }
}

// Perfil de nutrição (todos os campos opcionais): nascimento, atividade, objetivo, ritmo, ajustes aceitos e favoritos.
function nutricaoPerfilOk(p) {
  if (!vazioOu(p.nascimento, ehISO) || !vazioOu(p.cruzamentoDelivery, bool)) return false;
  const n = p.nutricao;
  if (n == null) return true;
  return typeof n === "object" && !Array.isArray(n)
    && vazioOu(n.objetivo, (v) => OBJETIVOS_NUTRICAO.includes(v)) && vazioOu(n.atividade, (v) => NIVEIS_ATIVIDADE.includes(v))
    && vazioOu(n.ritmoPct, (v) => numero(v, 0.1, 1)) && vazioOu(n.ajusteKcal, (v) => inteiro(v, -600, 600)) && vazioOu(n.ultimoAjusteEm, ehISO)
    && vazioOu(n.treinaForca, bool) && vazioOu(n.proteinaGKg, (v) => numero(v, 0.6, 3))
    && (n.favoritos == null || (Array.isArray(n.favoritos) && n.favoritos.length <= 60 && n.favoritos.every((f) => typeof f === "string" && f.length >= 1 && f.length <= 80)));
}

// Regras de um item isolado (forma e intervalos). Referências a outras coleções ficam em `validarReferencias`.
function regrasDoItem(colecao, x) {
  const e = [];
  const falha = (codigo) => e.push(codigo);
  if (!x || typeof x !== "object" || Array.isArray(x)) return [`${colecao}.item_invalido`];
  if (colecao !== "faturas" && colecao !== "snapshots" && !idOk(x.id)) falha(`${colecao}.id_invalido`);
  switch (colecao) {
    case "contas":
      if (!textoCheio(x.nome, 60)) falha("conta.nome_invalido");
      if (!TIPOS_CONTA.includes(x.tipo)) falha("conta.tipo_invalido");
      if (!ehMoeda(x.moeda)) falha("conta.moeda_invalida");
      if (!inteiro(x.saldoInicialCentavos, -MAX_CENTAVOS, MAX_CENTAVOS)) falha("conta.saldo_inicial_invalido");
      if (!ehISO(x.dataSaldoInicial)) falha("conta.data_saldo_inicial_invalida");
      if (!bool(x.arquivada)) falha("conta.arquivada_invalida");
      break;
    case "cartoes":
      if (!textoCheio(x.nome, 60)) falha("cartao.nome_invalido");
      if (!inteiro(x.diaFechamento, 1, 31)) falha("cartao.dia_fechamento_invalido");
      if (!inteiro(x.diaVencimento, 1, 31)) falha("cartao.dia_vencimento_invalido");
      if (!bool(x.fechaInclusivo)) falha("cartao.fecha_inclusivo_invalido");
      if (!vazioOu(x.limiteCentavos, (v) => inteiro(v, 0, MAX_CENTAVOS))) falha("cartao.limite_invalido");
      if (!idOk(x.contaPagamentoId)) falha("cartao.conta_pagamento_invalida");
      if (!vazioOu(x.pagamentoMinimoBp, (v) => inteiro(v, 0, 10000))) falha("cartao.pagamento_minimo_invalido");
      break;
    case "categorias":
      if (!textoCheio(x.nome, 40)) falha("categoria.nome_invalido");
      if (x.tipo !== "despesa" && x.tipo !== "receita") falha("categoria.tipo_invalido");
      if (!bool(x.essencial)) falha("categoria.essencial_invalido");
      if (x.tipo === "despesa" ? !GRUPOS.includes(x.grupo) : !vazioOu(x.grupo, (g) => GRUPOS.includes(g))) falha("categoria.grupo_invalido");
      break;
    case "lancamentos":
      if (!ehISO(x.data)) falha("lancamento.data_invalida");
      if (!TIPOS_LANCAMENTO.includes(x.tipo)) falha("lancamento.tipo_invalido");
      if (!inteiro(x.centavos, 1, MAX_CENTAVOS)) falha("lancamento.valor_invalido");
      if (!texto(x.descricao ?? "", 200)) falha("lancamento.descricao_longa");
      if (!Array.isArray(x.tags ?? []) || (x.tags ?? []).some((t) => !textoCheio(t, 30))) falha("lancamento.tags_invalidas");
      if (!vazioOu(x.meio, (m) => MEIOS.includes(m))) falha("lancamento.meio_invalido");
      if (!ehMoeda(x.moeda)) falha("lancamento.moeda_invalida");
      if (!vazioOu(x.centavosMoeda, (v) => inteiro(v, 1, MAX_CENTAVOS))) falha("lancamento.valor_moeda_invalido");
      if (!vazioOu(x.taxaBp, (v) => inteiro(v, 1, 1e9))) falha("lancamento.taxa_invalida");
      // "cancelado": parcela futura de compra estornada (marcada, nunca apagada: fica auditável). Não entra em saldo nem em resumo.
      if (!["previsto", "efetivado", "cancelado"].includes(x.status)) falha("lancamento.status_invalido");
      if (!vazioOu(x.canceladoPor, idOk)) falha("lancamento.cancelado_por_invalido");
      if (!vazioOu(x.dataPrevista, ehISO)) falha("lancamento.data_prevista_invalida");
      if (x.origem !== "manual" && x.origem !== "importacao") falha("lancamento.origem_invalida");
      if (!vazioOu(x.fatura, ehYM)) falha("lancamento.fatura_invalida");
      if (!ehInstante(x.atualizadoEm)) falha("lancamento.atualizado_em_invalido");
      {
        const temConta = x.contaId != null, temCartao = x.cartaoId != null;
        if (x.tipo === "transferencia") {
          if (!temConta) falha("lancamento.transferencia_sem_conta_origem");
          if (temCartao) {
            // Pagamento de fatura: sai da conta e entra no cartão (não é despesa: a despesa foi a compra).
            if (x.contaDestinoId != null) falha("lancamento.transferencia_destino_duplo");
            if (!ehYM(x.fatura)) falha("lancamento.pagamento_sem_fatura");
          } else if (!idOk(x.contaDestinoId)) falha("lancamento.transferencia_sem_destino");
          else if (x.contaDestinoId === x.contaId) falha("lancamento.transferencia_mesma_conta");
          if (x.categoriaId != null) falha("lancamento.transferencia_com_categoria");
        } else {
          if (temConta === temCartao) falha("lancamento.conta_ou_cartao"); // exatamente um dos dois
          if (x.contaDestinoId != null) falha("lancamento.destino_so_em_transferencia");
          // Lançamento IMPORTADO pode chegar sem categoria (nenhuma regra casou): fica pendente de classificação
          // e a UI o lista no check-in. Lançamento manual sem categoria continua recusado.
          const semCategoriaOk = x.tipo !== "estorno" && x.categoriaId == null && x.origem === "importacao";
          if (x.tipo === "estorno" ? !idOk(x.refId) : !(idOk(x.categoriaId) || semCategoriaOk)) falha(x.tipo === "estorno" ? "lancamento.estorno_sem_ref" : "lancamento.sem_categoria");
        }
        if (x.parcela != null) {
          const p = x.parcela;
          if (!p || typeof p !== "object" || !idOk(p.grupoId) || !inteiro(p.de, 2, 420) || !inteiro(p.n, 1, p.de) || !inteiro(p.totalCentavos, 1, MAX_CENTAVOS)) falha("lancamento.parcela_invalida");
        }
      }
      break;
    case "recorrencias":
      if (!textoCheio(x.nome, 60)) falha("recorrencia.nome_invalido");
      if (!["receita", "despesa", "transferencia"].includes(x.tipo)) falha("recorrencia.tipo_invalido");
      if (!inteiro(x.centavos, 1, MAX_CENTAVOS)) falha("recorrencia.valor_invalido");
      if (!["semanal", "mensal", "anual", "diasUteis"].includes(x.freq)) falha("recorrencia.freq_invalida");
      if (!inteiro(x.intervalo ?? 1, 1, 60)) falha("recorrencia.intervalo_invalido");
      if (!vazioOu(x.diaDoMes, (v) => inteiro(v, 1, 31))) falha("recorrencia.dia_invalido");
      if (!vazioOu(x.ajuste, (v) => ["ultimoDia", "proximoDiaUtil", "diaUtilAnterior"].includes(v))) falha("recorrencia.ajuste_invalido");
      if (!ehISO(x.inicio)) falha("recorrencia.inicio_invalido");
      if (!vazioOu(x.fim, ehISO)) falha("recorrencia.fim_invalido");
      if (!bool(x.ativa)) falha("recorrencia.ativa_invalida");
      if ((x.contaId != null) === (x.cartaoId != null)) falha("recorrencia.conta_ou_cartao");
      break;
    case "faturas":
      if (!idOk(x.cartaoId)) falha("fatura.cartao_invalido");
      if (!ehYM(x.ym)) falha("fatura.ym_invalido");
      if (!["aberta", "fechada", "paga", "parcial"].includes(x.status)) falha("fatura.status_invalido");
      if (!inteiro(x.pagoCentavos ?? 0, 0, MAX_CENTAVOS)) falha("fatura.pago_invalido");
      break;
    case "metas":
      if (!textoCheio(x.nome, 60)) falha("meta.nome_invalido");
      if (!TIPOS_META.includes(x.tipo)) falha("meta.tipo_invalido");
      // peso em kg e poupança em % são números; treino em treinos/semana e o resto em centavos são inteiros.
      if (x.tipo === "peso" ? !numero(x.alvo, 20, 500) : x.tipo === "poupanca" ? !numero(x.alvo, 0, 100) : x.tipo === "treino" ? !inteiro(x.alvo, 1, 14) : !inteiro(x.alvo, 1, MAX_CENTAVOS)) falha("meta.alvo_invalido");
      if (!vazioOu(x.atual, (v) => numero(v, 0, MAX_CENTAVOS))) falha("meta.atual_invalido");
      if (!vazioOu(x.prazo, ehISO)) falha("meta.prazo_invalido");
      if (!vazioOu(x.taxaBp, (v) => inteiro(v, 0, 1e6)) || !vazioOu(x.inflacaoBp, (v) => inteiro(v, 0, 1e6))) falha("meta.taxa_invalida");
      break;
    case "dividas":
      if (!textoCheio(x.nome, 60)) falha("divida.nome_invalido");
      if (!inteiro(x.saldoCentavos, 0, MAX_CENTAVOS)) falha("divida.saldo_invalido");
      if (!inteiro(x.taxaMensalBp, 0, 1e6)) falha("divida.taxa_invalida");
      if (!inteiro(x.parcelaMinimaCentavos, 0, MAX_CENTAVOS)) falha("divida.parcela_minima_invalida");
      if (!vazioOu(x.parcelasRestantes, (v) => inteiro(v, 0, 1200))) falha("divida.parcelas_invalidas");
      if (!vazioOu(x.diaVencimento, (v) => inteiro(v, 1, 31))) falha("divida.dia_vencimento_invalido");
      break;
    case "investimentos":
      if (!textoCheio(x.nome, 60)) falha("investimento.nome_invalido");
      if (!idOk(x.contaId)) falha("investimento.conta_invalida");
      if (!textoCheio(x.produto, 40)) falha("investimento.produto_invalido");
      if (!vazioOu(x.percentualBp, (v) => inteiro(v, 0, 1e6)) || !vazioOu(x.taxaBp, (v) => inteiro(v, 0, 1e6))) falha("investimento.taxa_invalida");
      if (!bool(x.isentoIR)) falha("investimento.isento_ir_invalido");
      if (!ehISO(x.aplicacao) || !vazioOu(x.vencimento, ehISO) || !vazioOu(x.dataSaldo, ehISO)) falha("investimento.data_invalida");
      if (!inteiro(x.aporteCentavos, 1, MAX_CENTAVOS) || !vazioOu(x.saldoInformadoCentavos, (v) => inteiro(v, 0, MAX_CENTAVOS))) falha("investimento.valor_invalido");
      break;
    case "regras":
      if (!textoCheio(x.padrao, 200)) falha("regra.padrao_invalido");
      if (x.tipo !== "contem" && x.tipo !== "regex") falha("regra.tipo_invalido");
      if (!idOk(x.categoriaId)) falha("regra.categoria_invalida");
      if (!inteiro(x.prioridade ?? 0, -1000, 1000)) falha("regra.prioridade_invalida");
      if (!["base", "usuario", "aprendida"].includes(x.origem)) falha("regra.origem_invalida");
      if (!inteiro(x.acertos ?? 0, 0, 1e9)) falha("regra.acertos_invalidos");
      break;
    case "importacoes":
      if (!texto(x.arquivo ?? "", 255) || !texto(x.hashArquivo ?? "", 128)) falha("importacao.arquivo_invalido");
      if (!ehInstante(x.em)) falha("importacao.em_invalido");
      if (!Array.isArray(x.idsCriados) || x.idsCriados.some((i) => !idOk(i))) falha("importacao.ids_invalidos");
      break;
    case "pesos":
      if (!ehISO(x.data)) falha("peso.data_invalida");
      if (!numero(x.kg, 20, 500)) falha("peso.fora_da_faixa");
      break;
    case "medidas":
      if (!ehISO(x.data)) falha("medida.data_invalida");
      for (const k of ["cinturaCm", "pescocoCm", "quadrilCm", "peitoCm", "bracoCm", "coxaCm"]) if (!vazioOu(x[k], (v) => numero(v, 5, 300))) { falha("medida.fora_da_faixa"); break; }
      break;
    case "treinos":
      if (!ehISO(x.data)) falha("treino.data_invalida");
      if (!TIPOS_TREINO.includes(x.tipo)) falha("treino.tipo_invalido");
      if (!inteiro(x.minutos, 1, 1440)) falha("treino.duracao_invalida");
      if (!vazioOu(x.esforco, (v) => inteiro(v, 1, 5))) falha("treino.esforco_invalido");
      break;
    case "bemestar":
      // Um item por data (a tela do Corpo mescla no dia). Tudo opcional: dá para registrar só a água.
      if (!ehISO(x.data)) falha("bemestar.data_invalida");
      if (!vazioOu(x.sonoHoras, (v) => numero(v, 0, 24))) falha("bemestar.sono_horas_invalido");
      if (!vazioOu(x.sonoQualidade, (v) => inteiro(v, 1, 5)) || !vazioOu(x.energia, (v) => inteiro(v, 1, 5)) || !vazioOu(x.dor, (v) => inteiro(v, 1, 5))) falha("bemestar.escala_invalida");
      if (!vazioOu(x.dormiuMin, (v) => inteiro(v, 0, 1439)) || !vazioOu(x.acordouMin, (v) => inteiro(v, 0, 1439))) falha("bemestar.horario_invalido");
      if (!vazioOu(x.aguaMl, (v) => inteiro(v, 0, 20000))) falha("bemestar.agua_invalida");
      break;
    case "refeicoes": {
      // Foto dos macros no momento do registro; água usa `gramas` como ml e macros 0.
      if (!ehISO(x.data)) falha("refeicao.data_invalida");
      if (!REFEICOES_NUTRICAO.includes(x.refeicao)) falha("refeicao.tipo_invalido");
      if (!textoCheio(x.nome, 120) || !idOk(x.alimentoId)) falha("refeicao.alimento_invalido");
      if (!numero(x.gramas, 0.1, 20000)) falha("refeicao.quantidade_invalida");
      if (!inteiro(x.kcal, 0, 20000) || ["p", "c", "g", "fibra"].some((k) => !numero(x[k], 0, 5000))) falha("refeicao.nutriente_invalido");
      if (!ehInstante(x.atualizadoEm)) falha("refeicao.atualizado_em_invalido");
      break;
    }
    case "snapshots":
      if (!ehYM(x.ym)) falha("snapshot.ym_invalido");
      if (!inteiro(x.patrimonioCentavos, -MAX_CENTAVOS, MAX_CENTAVOS) || !inteiro(x.ativos, -MAX_CENTAVOS, MAX_CENTAVOS) || !inteiro(x.passivos, -MAX_CENTAVOS, MAX_CENTAVOS)) falha("snapshot.valor_invalido");
      break;
    // Motor de treino (js/v2/treino/): exercícios criados pela pessoa, rotinas, sessões de força e cardio.
    case "exercicios":
      if (!textoCheio(x.nome, 60)) falha("exercicio.nome_invalido");
      if (!GRUPOS_MUSCULARES.includes(x.grupo)) falha("exercicio.grupo_invalido");
      if (!EQUIPAMENTOS.includes(x.equipamento)) falha("exercicio.equipamento_invalido");
      if (!PADROES.includes(x.padrao)) falha("exercicio.padrao_invalido");
      if (!Array.isArray(x.primarios) || !x.primarios.length || [...x.primarios, ...(x.secundarios ?? [])].some((g) => !GRUPOS_MUSCULARES.includes(g))) falha("exercicio.musculos_invalidos");
      break;
    case "rotinas":
      if (!textoCheio(x.nome, 60)) falha("rotina.nome_invalido");
      if (!texto(x.programa ?? "", 60)) falha("rotina.programa_invalido");
      if (!vazioOu(x.ordem, (v) => inteiro(v, 1, 99))) falha("rotina.ordem_invalida");
      if (!Array.isArray(x.itens) || x.itens.length > 40) falha("rotina.itens_invalidos");
      else if (x.itens.some((i) => !i || !idOk(i.exercicioId) || !inteiro(i.series, 1, 20) || !inteiro(i.repsMin, 1, 300) || !inteiro(i.repsMax, 1, 300) || i.repsMax < i.repsMin || !vazioOu(i.descansoS, (v) => inteiro(v, 0, 900)) || !vazioOu(i.incremento, (v) => numero(v, 0, 50)))) falha("rotina.item_invalido");
      break;
    case "sessoes":
      if (!ehISO(x.data)) falha("sessao.data_invalida");
      if (x.estado !== "andamento" && x.estado !== "concluida") falha("sessao.estado_invalido");
      if (!vazioOu(x.inicio, ehInstante) || !vazioOu(x.fim, ehInstante)) falha("sessao.instante_invalido");
      if (!vazioOu(x.minutos, (v) => inteiro(v, 1, 1440))) falha("sessao.duracao_invalida");
      if (!texto(x.rotinaNome ?? "", 60) || !texto(x.obs ?? "", 500)) falha("sessao.texto_invalido");
      if (!Array.isArray(x.series) || x.series.length > 400) falha("sessao.series_invalidas");
      else if (x.series.some((s) => !s || !idOk(s.exercicioId) || !numero(s.kg, 0, 1000) || !inteiro(s.reps, 1, 300) || !vazioOu(s.rir, (v) => inteiro(v, 0, 10)) || !vazioOu(s.aquecimento, bool) || !vazioOu(s.em, ehInstante))) falha("sessao.serie_invalida");
      break;
    case "cardio":
      if (!ehISO(x.data)) falha("cardio.data_invalida");
      if (!MODALIDADES.includes(x.modalidade)) falha("cardio.modalidade_invalida");
      if (!inteiro(x.minutos, 1, 1440)) falha("cardio.duracao_invalida");
      if (!vazioOu(x.km, (v) => numero(v, 0.01, 1000))) falha("cardio.distancia_invalida");
      if (!vazioOu(x.fcMedia, (v) => inteiro(v, 30, 250))) falha("cardio.fc_invalida");
      if (!vazioOu(x.esforco, (v) => inteiro(v, 1, 5))) falha("cardio.esforco_invalido");
      break;
    default:
      falha("colecao.desconhecida");
  }
  return e;
}

// Referências entre coleções: quem aponta para quem precisa existir (e ser do tipo certo).
function referencias(d, colecao, x) {
  const e = [];
  const existe = (col, id) => id == null || d[col].some((y) => y.id === id);
  const cat = (id) => d.categorias.find((c) => c.id === id);
  const falha = (codigo) => e.push(codigo);
  const singular = colecao.replace(/oes$/, "ao").replace(/s$/, "");
  if ("contaId" in x && x.contaId != null && !existe("contas", x.contaId)) falha(`${singular}.conta_inexistente`);
  if ("cartaoId" in x && x.cartaoId != null && !existe("cartoes", x.cartaoId)) falha(`${singular}.cartao_inexistente`);
  if (colecao === "cartoes" && !existe("contas", x.contaPagamentoId)) falha("cartao.conta_pagamento_inexistente");
  if (colecao === "lancamentos") {
    if (x.tipo === "transferencia" && x.cartaoId == null && !existe("contas", x.contaDestinoId)) falha("lancamento.conta_destino_inexistente");
    if (x.categoriaId != null) {
      const c = cat(x.categoriaId);
      if (!c) falha("lancamento.categoria_inexistente");
      else if ((x.tipo === "receita" || x.tipo === "despesa") && c.tipo !== x.tipo) falha("lancamento.categoria_tipo_divergente");
    }
    if (x.tipo === "estorno") {
      const compra = d.lancamentos.find((l) => l.id === x.refId);
      if (!compra || compra.tipo !== "despesa") falha("lancamento.estorno_sem_compra");
      else if (x.centavos > compra.centavos) falha("lancamento.estorno_maior_que_compra");
    }
    if (x.recorrenciaId != null && !existe("recorrencias", x.recorrenciaId)) falha("lancamento.recorrencia_inexistente");
    if (x.importacaoId != null && !existe("importacoes", x.importacaoId)) falha("lancamento.importacao_inexistente");
  }
  if ((colecao === "recorrencias" || colecao === "regras") && x.categoriaId != null && !cat(x.categoriaId)) falha(`${singular}.categoria_inexistente`);
  if (colecao === "metas" && x.contaId != null && !existe("contas", x.contaId)) falha("meta.conta_inexistente");
  return e;
}

export function validarItem(d, colecao, x) {
  const forma = regrasDoItem(colecao, x);
  return forma.length ? forma : referencias(d, colecao, x);
}

// `perfil.plano` (opcional): escolhas da tela Plano. Fica no perfil, que já é persistido, para não criar
// singleton novo. Tudo opcional; o que vier tem de ter forma e faixa válidas.
export const ESTABILIDADES = ["estavel", "clt", "variavel", "autonomo"];
export const PERFIS_RISCO_PLANO = ["conservador", "moderado", "arrojado"];
export function validarPlano(p) {
  if (p == null) return [];
  if (typeof p !== "object" || Array.isArray(p)) return ["plano.invalido"];
  const e = [];
  const cent = (v, min) => vazioOu(v, (x) => inteiro(x, min, MAX_CENTAVOS));
  if (!cent(p.rendaCentavos, 1) || !cent(p.despesaDesejadaCentavos, 1) || !cent(p.aporteMensalCentavos, 0) || !cent(p.reservaAtualCentavos, 0)) e.push("plano.valor_invalido");
  if (!vazioOu(p.anos, (v) => inteiro(v, 1, 60))) e.push("plano.anos_invalido");
  if (!vazioOu(p.retiradaBp, (v) => inteiro(v, 200, 600))) e.push("plano.retirada_invalida");
  if (!vazioOu(p.estabilidade, (v) => ESTABILIDADES.includes(v))) e.push("plano.estabilidade_invalida");
  if (!vazioOu(p.risco, (v) => PERFIS_RISCO_PLANO.includes(v))) e.push("plano.risco_invalido");
  if (!vazioOu(p.dependentes, bool) || !vazioOu(p.rendaUnica, bool)) e.push("plano.fator_invalido");
  if (p.taxasReaisBp != null) {
    const t = p.taxasReaisBp;
    if (typeof t !== "object" || ![t.pessimistaBp, t.baseBp, t.otimistaBp].every((v) => inteiro(v, 0, 2000))) e.push("plano.taxas_invalidas");
    else if (!(t.pessimistaBp <= t.baseBp && t.baseBp <= t.otimistaBp)) e.push("plano.taxas_fora_de_ordem");
  }
  return e;
}

// Extras OPCIONAIS do perfil usados pelos insights e pela revisão semanal (aditivos: perfil antigo sem eles continua válido).
//  insightsDispensados: chaves de insight que a pessoa dispensou (nunca voltam; no máximo 300).
//  revisoes: { "<segunda-feira ISO>": { vitorias: até 3 textos, ajuste, intencao, atualizadoEm } }, no máximo 156 semanas.
export const MAX_DISPENSADOS = 300, MAX_TEXTO_REVISAO = 280, MAX_SEMANAS_REVISAO = 156;
export function perfilExtrasErros(p) {
  const e = [];
  const lista = p.insightsDispensados;
  if (lista !== undefined && (!Array.isArray(lista) || lista.length > MAX_DISPENSADOS || lista.some((c) => !textoCheio(c, 120)))) e.push("perfil.insights_dispensados_invalidos");
  const r = p.revisoes;
  if (r !== undefined) {
    const ok = r && typeof r === "object" && !Array.isArray(r) && Object.keys(r).length <= MAX_SEMANAS_REVISAO && Object.entries(r).every(([semana, x]) =>
      ehISO(semana) && x && typeof x === "object" && Array.isArray(x.vitorias) && x.vitorias.length <= 3 && x.vitorias.every((v) => texto(v, MAX_TEXTO_REVISAO))
      && texto(x.ajuste ?? "", MAX_TEXTO_REVISAO) && texto(x.intencao ?? "", MAX_TEXTO_REVISAO) && vazioOu(x.atualizadoEm, ehInstante));
    if (!ok) e.push("perfil.revisoes_invalidas");
  }
  return e;
}

export function validar(d) {
  const erros = [];
  const erro = (codigo, caminho) => erros.push({ codigo, caminho });
  if (!d || typeof d !== "object") return { ok: false, erros: [{ codigo: "dados.nao_objeto", caminho: "" }] };
  if (d.versao !== VERSAO) erro("dados.versao_diferente", "versao");
  const m = d.meta;
  if (!m || typeof m !== "object" || !ehInstante(m.criadoEm) || !ehInstante(m.atualizadoEm) || !vazioOu(m.ultimoBackupEm, ehInstante) || !vazioOu(m.migradoDeV1Em, ehInstante)) erro("meta.invalida", "meta");
  else if (!Array.isArray(m.removidos) || m.removidos.some((r) => !r || !idOk(r.id) || !COLECOES.includes(r.colecao) || !ehInstante(r.removidoEm))) erro("meta.removidos_invalidos", "meta.removidos");
  const p = d.perfil;
  if (!p || (p.sexo !== "" && p.sexo !== "m" && p.sexo !== "f") || !vazioOu(p.alturaCm, (v) => numero(v, 80, 250)) || !vazioOu(p.nascimento, ehISO) || !vazioOu(p.metaSonoHoras, (v) => numero(v, 4, 12)) || !nutricaoPerfilOk(p) || (p.idioma !== "pt-BR" && p.idioma !== "en") || !ehMoeda(p.moedaPadrao) || !vazioOu(p.idade, (v) => inteiro(v, 10, 100)) || !vazioOu(p.fcMaxBpm, (v) => inteiro(v, 100, 230)) || !vazioOu(p.fcRepousoBpm, (v) => inteiro(v, 30, 120))) erro("perfil.invalido", "perfil");
  for (const codigo of validarPlano(p?.plano)) erro(codigo, "perfil.plano");
  if (p && typeof p === "object") for (const codigo of perfilExtrasErros(p)) erro(codigo, "perfil");
  const o = d.orcamento;
  if (!o || typeof o !== "object" || !METODOS_ORCAMENTO.includes(o.metodo) || !bool(o.rollover) || !o.limites || typeof o.limites !== "object") erro("orcamento.invalido", "orcamento");
  for (const c of COLECOES) if (!Array.isArray(d[c]) && !(OPCIONAIS.has(c) && d[c] === undefined)) erro("colecao.nao_lista", c);
  if (erros.length) return { ok: false, erros };

  const ids = new Set();
  for (const c of COLECOES) {
    (d[c] ?? []).forEach((x, i) => {
      const caminho = `${c}[${i}]`;
      for (const codigo of validarItem(d, c, x)) erro(codigo, caminho);
      const chave = c === "faturas" ? `${x?.cartaoId}/${x?.ym}` : c === "snapshots" ? x?.ym : x?.id;
      if (chave != null) { if (ids.has(`${c === "faturas" || c === "snapshots" ? c + ":" : ""}${chave}`)) erro(`${c}.id_repetido`, caminho); ids.add(`${c === "faturas" || c === "snapshots" ? c + ":" : ""}${chave}`); }
    });
  }
  for (const [catId, v] of Object.entries(o.limites)) {
    const c = d.categorias.find((x) => x.id === catId);
    if (!c || c.tipo !== "despesa") erro("orcamento.categoria_inexistente", `orcamento.limites.${catId}`);
    if (!inteiro(v, 1, MAX_CENTAVOS)) erro("orcamento.limite_invalido", `orcamento.limites.${catId}`);
  }
  // Grupo de parcelas: mesmo `de` e mesmo total; n sem repetição; quando o grupo está completo, Σ = total.
  const grupos = new Map();
  d.lancamentos.forEach((l, i) => { if (l?.parcela?.grupoId) { if (!grupos.has(l.parcela.grupoId)) grupos.set(l.parcela.grupoId, []); grupos.get(l.parcela.grupoId).push([l, i]); } });
  for (const itens of grupos.values()) {
    const [[p0, i0]] = itens, caminho = `lancamentos[${i0}]`, ns = new Set();
    let soma = 0;
    for (const [l] of itens) {
      if (l.parcela.de !== p0.parcela.de || l.parcela.totalCentavos !== p0.parcela.totalCentavos) { erro("lancamento.parcela_grupo_divergente", caminho); break; }
      if (ns.has(l.parcela.n)) { erro("lancamento.parcela_n_repetido", caminho); break; }
      ns.add(l.parcela.n); soma += l.centavos;
    }
    if (itens.length === p0.parcela.de && soma !== p0.parcela.totalCentavos) erro("lancamento.parcela_soma_divergente", caminho);
  }
  return { ok: erros.length === 0, erros };
}

// ---------- CRUD imutável (o objeto recebido nunca é alterado) ----------
// Ordem canônica: o IndexedDB devolve por chave (id), o documento vive por data. Quem lê do armazém
// e quem migra passam por aqui, então "salvou e releu" compara igual.
export const ordenar = (colecao, lista) => (POR_DATA.has(colecao) ? [...lista].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) : lista);
const comMeta = (d, t) => ({ ...d, meta: { ...d.meta, atualizadoEm: t } });
const temId = (colecao) => colecao !== "faturas" && colecao !== "snapshots";

export function adicionar(d, colecao, item, { novoId = novoIdPadrao, agora = agoraPadrao } = {}) {
  if (!COLECOES.includes(colecao)) throw new ErroEsquema([{ codigo: "colecao.desconhecida", caminho: colecao }]);
  const t = agora();
  const novo = { ...item, ...(temId(colecao) ? { id: item.id ?? novoId() } : {}), ...(colecao === "lancamentos" ? { atualizadoEm: t, tags: item.tags ?? [], status: item.status ?? "efetivado", origem: item.origem ?? "manual", descricao: item.descricao ?? "" } : {}) };
  // Ids são globais (merge por id entre arquivos): repetido em QUALQUER coleção é recusado.
  if (temId(colecao) && COLECOES.some((c) => temId(c) && (d[c] ?? []).some((x) => x.id === novo.id))) throw new ErroEsquema([{ codigo: `${colecao}.id_repetido`, caminho: colecao }]);
  const erros = validarItem(d, colecao, novo);
  if (erros.length) throw new ErroEsquema(erros.map((codigo) => ({ codigo, caminho: colecao })));
  return comMeta({ ...d, [colecao]: ordenar(colecao, [...(d[colecao] ?? []), novo]) }, t);
}

export function editar(d, colecao, id, mudancas, { agora = agoraPadrao } = {}) {
  const i = d[colecao]?.findIndex((x) => x.id === id);
  if (i == null || i < 0) throw new ErroEsquema([{ codigo: `${colecao}.inexistente`, caminho: `${colecao}/${id}` }]);
  const t = agora();
  const novo = { ...d[colecao][i], ...mudancas, id, ...(colecao === "lancamentos" ? { atualizadoEm: t } : {}) };
  // O item editado sai da lista antes da validação: um estorno não pode apontar para si mesmo.
  const sem = { ...d, [colecao]: d[colecao].filter((_, j) => j !== i) };
  const erros = validarItem(sem, colecao, novo);
  if (erros.length) throw new ErroEsquema(erros.map((codigo) => ({ codigo, caminho: `${colecao}/${id}` })));
  const lista = d[colecao].slice(); lista[i] = novo;
  return comMeta({ ...d, [colecao]: ordenar(colecao, lista) }, t);
}

// Remover deixa um tombstone em meta.removidos: o merge por arquivo (área 5) precisa saber que o id
// sumiu de propósito, senão o outro lado o traz de volta.
export function remover(d, colecao, id, { agora = agoraPadrao } = {}) {
  if (!d[colecao]?.some((x) => x.id === id)) throw new ErroEsquema([{ codigo: `${colecao}.inexistente`, caminho: `${colecao}/${id}` }]);
  const dependentes = colecao === "contas" ? [...d.lancamentos.filter((l) => l.contaId === id || l.contaDestinoId === id), ...d.cartoes.filter((c) => c.contaPagamentoId === id)]
    : colecao === "cartoes" ? d.lancamentos.filter((l) => l.cartaoId === id)
    : colecao === "categorias" ? [...d.lancamentos.filter((l) => l.categoriaId === id), ...d.regras.filter((r) => r.categoriaId === id)]
    : colecao === "lancamentos" ? d.lancamentos.filter((l) => l.refId === id)
    : colecao === "exercicios" ? [...d.rotinas.filter((r) => r.itens.some((i) => i.exercicioId === id)), ...d.sessoes.filter((s) => s.series.some((x) => x.exercicioId === id))] : [];
  if (dependentes.length) throw new ErroEsquema([{ codigo: `${colecao}.em_uso`, caminho: `${colecao}/${id}` }]);
  const t = agora();
  return { ...d, [colecao]: d[colecao].filter((x) => x.id !== id), meta: { ...d.meta, atualizadoEm: t, removidos: [...d.meta.removidos, { id, colecao, removidoEm: t }] } };
}

export const definir = (d, parte, valores, { agora = agoraPadrao } = {}) => comMeta({ ...d, [parte]: { ...d[parte], ...valores } }, agora());

// ---------- consultas ----------
export const lancamentosDoMes = (d, ym) => d.lancamentos.filter((l) => mesDe(l.data) === ym);

// Saldo de uma conta no fim do dia `ate`. O saldo inicial vale no INÍCIO de `dataSaldoInicial`, então
// lançamentos daquele dia em diante entram. Lançamento no cartão não mexe na conta (a fatura paga é que mexe).
export function saldoDaConta(d, contaId, ate, { incluirPrevistos = false } = {}) {
  const c = d.contas.find((x) => x.id === contaId);
  if (!c) return null;
  let s = c.saldoInicialCentavos;
  for (const l of d.lancamentos) {
    if (l.data < c.dataSaldoInicial || (ate && l.data > ate) || (!incluirPrevistos && l.status !== "efetivado")) continue;
    if (l.tipo === "transferencia") { if (l.contaId === contaId) s -= l.centavos; if (l.contaDestinoId === contaId) s += l.centavos; continue; }
    if (l.contaId !== contaId) continue;
    s += l.tipo === "despesa" ? -l.centavos : l.centavos; // receita e estorno entram
  }
  return s;
}

// Resumo do mês na moeda pedida. Transferência não é receita nem despesa (dinheiro só mudou de bolso);
// estorno reduz a despesa do mês em que foi estornado, na categoria da compra.
export function resumoMes(d, ym, { moeda = d.perfil.moedaPadrao, incluirPrevistos = false } = {}) {
  let receitas = 0, despesas = 0, estornos = 0;
  const cat = {};
  const compra = (id) => d.lancamentos.find((l) => l.id === id);
  for (const l of lancamentosDoMes(d, ym)) {
    if (l.moeda !== moeda || l.tipo === "transferencia" || (!incluirPrevistos && l.status !== "efetivado")) continue;
    if (l.tipo === "receita") receitas += l.centavos;
    else if (l.tipo === "despesa") { despesas += l.centavos; const k = l.categoriaId ?? SEM_CATEGORIA; cat[k] = (cat[k] || 0) + l.centavos; }
    else { const k = l.categoriaId ?? compra(l.refId)?.categoriaId; estornos += l.centavos; if (k) cat[k] = (cat[k] || 0) - l.centavos; }
  }
  despesas -= estornos;
  const saldo = receitas - despesas;
  return {
    ym, moeda, receitas, despesas, estornos, saldo,
    taxaPoupanca: receitas > 0 ? Math.round((saldo / receitas) * 1000) / 10 : null,
    porCategoria: Object.entries(cat).filter(([, v]) => v !== 0).map(([categoriaId, centavos]) => ({ categoriaId, centavos })).sort((a, b) => b.centavos - a.centavos),
  };
}

// Busca sem acento e sem caixa: "acai" acha "Açaí".
export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarLancamentos(d, { texto: q, categoriaId, contaId, cartaoId, de, ate, tipo, tag, status } = {}) {
  const nq = q ? normalizar(q) : "";
  return d.lancamentos.filter((l) =>
    (!nq || normalizar(l.descricao).includes(nq) || (l.tags ?? []).some((t) => normalizar(t).includes(nq)))
    && (categoriaId == null || l.categoriaId === categoriaId)
    && (contaId == null || l.contaId === contaId || l.contaDestinoId === contaId)
    && (cartaoId == null || l.cartaoId === cartaoId)
    && (de == null || l.data >= de) && (ate == null || l.data <= ate)
    && (tipo == null || l.tipo === tipo) && (status == null || l.status === status)
    && (tag == null || (l.tags ?? []).includes(tag)));
}

export const exportarJSON = (d) => JSON.stringify(d, null, 1);
