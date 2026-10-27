// Leitor de CSV de extrato GENÉRICO com detecção: separador, linha do cabeçalho e papel de cada
// coluna são deduzidos do próprio arquivo, e a leitura devolve uma CONFIANÇA para a UI decidir se
// mostra a tela de mapeamento manual (`confianca < LIMIAR_CONFIANCA`).
//
// Por que genérico e não um perfil por banco: só três formatos têm fonte pública confiável, e
// mesmo eles mudaram (o Nubank cartão já exportou `"94,59"` e hoje exporta `94.59`). Perfil fixo
// por banco quebra em silêncio na próxima mudança; detecção + confiança + mapeamento salvo pelo
// usuário (`perfisCSV`) aguenta o banco que ainda não vimos.
//
// Os três formatos com fonte (viram perfis-base, reconhecidos pelo cabeçalho exato):
// - Nubank conta: `Data,Valor,Identificador,Descrição`, DD/MM/AAAA, sinal do banco
//   (controle-financeiro-familiar/familia-gomes-oliveira PR #141; comunidade.nubank.com.br/t/305197).
// - Nubank cartão: `date,title,amount`, AAAA-MM-DD; positivo = compra, negativo (às vezes "- 1500,00")
//   = pagamento/estorno (mesma PR #141; micheldpcarlos/nubank-csv).
// - Inter conta: linhas de resumo antes da tabela, `;`, `Data Lançamento;Histórico;Descrição;Valor;Saldo`,
//   valor "R$ 1.234,56" (marcoantoniosouza/extratoBancoInter, Arquivo.py: header=6, sep=';').
// Os demais bancos (BB, Itaú, Bradesco, Caixa, Santander, C6, PicPay…) NÃO têm amostra pública
// confiável: caem na detecção genérica, e é para isso que a confiança e o mapeamento manual existem.
import { charsetDeclaradoNosBytes, decodificar, lerCentavos, lerDataExtrato, normalizarTexto } from "./comum.mjs";

export const LIMIAR_CONFIANCA = 0.8;
export const SEPARADORES = [";", ",", "\t", "|"];

// Sinônimos por papel, já normalizados (minúsculas, sem acento). Ordem importa: o primeiro que casa vence.
export const SINONIMOS = {
  data: ["data", "date", "data lancamento", "data do lancamento", "data da compra", "data movimento", "data mov", "dt lancamento", "dt", "lancamento", "data da transacao", "data transacao", "posted", "booking date"],
  valor: ["valor", "amount", "value", "montante", "valor (r$)", "valor r$", "vlr", "quantia", "total"],
  descricao: ["descricao", "historico", "title", "memo", "description", "detalhes", "estabelecimento", "lancamento", "nome", "name", "payee", "descricao/historico", "transacao"],
  complemento: ["descricao", "historico", "detalhe", "detalhes", "complemento", "observacao", "obs", "memo", "estabelecimento"],
  identificador: ["identificador", "id", "fitid", "codigo", "documento", "n documento", "nº documento", "num documento", "numero do documento", "ref", "referencia", "transaction id", "id transacao"],
  debito: ["debito", "debitos", "saida", "saidas", "debit", "despesa", "valor debito", "d"],
  credito: ["credito", "creditos", "entrada", "entradas", "credit", "receita", "valor credito", "c"],
  saldo: ["saldo", "balance", "saldo (r$)", "saldo atual"],
};

export const PERFIS_CSV_BASE = [
  { id: "nubank-conta", nome: "Nubank — conta", cabecalho: ["data", "valor", "identificador", "descricao"], mapeamento: { colunas: { data: 0, valor: 1, identificador: 2, descricao: 3 }, sinal: "banco" } },
  { id: "nubank-cartao", nome: "Nubank — cartão", cabecalho: ["date", "title", "amount"], mapeamento: { colunas: { data: 0, descricao: 1, valor: 2 }, sinal: "cartao" } },
  { id: "inter-conta", nome: "Inter — conta", cabecalho: ["data lancamento", "historico", "descricao", "valor", "saldo"], mapeamento: { colunas: { data: 0, descricao: 1, complemento: 2, valor: 3, saldo: 4 }, sinal: "banco" } },
];

// Separa em linhas e células no estilo RFC 4180: aspas protegem separador e quebra de linha,
// `""` dentro de aspas é uma aspa. Aceita \r\n e \n.
export function dividirTabela(texto, separador) {
  const linhas = [];
  let linha = [], cel = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') { if (texto[i + 1] === '"') { cel += '"'; i++; } else aspas = false; }
      else cel += ch;
    } else if (ch === '"' && cel === "") aspas = true;
    else if (ch === separador) { linha.push(cel); cel = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      linha.push(cel); linhas.push(linha); linha = []; cel = "";
    } else cel += ch;
  }
  if (cel !== "" || linha.length) { linha.push(cel); linhas.push(linha); }
  return linhas.map((l) => l.map((c) => c.trim()));
}

// Conta cada separador FORA de aspas nas 10 primeiras linhas não vazias e escolhe o que aparece em
// mais linhas, desempatando pelo total. Vírgula dentro de `"94,59"` não conta: por isso `date,title,amount`
// com valores entre aspas ainda sai como `,`.
export function detectarSeparador(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let melhor = ";", melhorPontos = -1;
  for (const sep of SEPARADORES) {
    let linhasCom = 0, total = 0;
    for (const l of linhas) {
      let n = 0, aspas = false;
      for (const ch of l) { if (ch === '"') aspas = !aspas; else if (!aspas && ch === sep) n++; }
      if (n) { linhasCom++; total += n; }
    }
    const pontos = linhasCom * 1000 + total;
    if (pontos > melhorPontos) { melhor = sep; melhorPontos = pontos; }
  }
  return melhor;
}

const casa = (celula, lista) => { const c = normalizarTexto(celula).replace(/[:.]+$/, ""); return lista.includes(c) || lista.some((s) => s.length > 3 && c.startsWith(s + " ")); };

// Primeira linha com ≥3 células não vazias, uma de data e uma de valor (ou débito/crédito).
// Inter tem 6 linhas de resumo antes; Nubank cartão tem exatamente 3 colunas.
export function acharCabecalho(tabela) {
  for (let i = 0; i < Math.min(tabela.length, 40); i++) {
    const l = tabela[i].filter((c) => c !== "");
    if (l.length < 3) continue;
    const temData = l.some((c) => casa(c, SINONIMOS.data));
    const temValor = l.some((c) => casa(c, SINONIMOS.valor)) || (l.some((c) => casa(c, SINONIMOS.debito)) && l.some((c) => casa(c, SINONIMOS.credito)));
    if (temData && temValor) return i;
  }
  return -1;
}

export const acharPerfil = (perfis, cabecalho) => {
  const norm = cabecalho.map((c) => normalizarTexto(c)).filter(Boolean).join("|");
  return perfis.find((p) => p.cabecalho.map(normalizarTexto).join("|") === norm) ?? null;
};

// Mapeia cada coluna por sinônimo. Devolve índices (não nomes) para não depender de acento/caixa.
export function detectarMapeamento(cabecalho) {
  const colunas = {}, usadas = new Set();
  const pegar = (papel, lista) => {
    for (let i = 0; i < cabecalho.length; i++) if (!usadas.has(i) && cabecalho[i] && casa(cabecalho[i], lista)) { colunas[papel] = i; usadas.add(i); return true; }
    return false;
  };
  pegar("data", SINONIMOS.data);
  const temValor = pegar("valor", SINONIMOS.valor);
  if (!temValor) { pegar("debito", SINONIMOS.debito); pegar("credito", SINONIMOS.credito); }
  pegar("descricao", SINONIMOS.descricao);
  pegar("complemento", SINONIMOS.complemento);
  pegar("identificador", SINONIMOS.identificador);
  pegar("saldo", SINONIMOS.saldo);
  const colunasNaoMapeadas = cabecalho.map((c, i) => (usadas.has(i) || !c ? null : c)).filter((c) => c !== null);
  // "title"/"amount" sem identificador é a cara do extrato de cartão: positivo = compra.
  const n = cabecalho.map(normalizarTexto);
  const sinal = n.includes("title") && n.includes("amount") ? "cartao" : "banco";
  const pontos = (colunas.data !== undefined ? 0.4 : 0) + (colunas.valor !== undefined || (colunas.debito !== undefined && colunas.credito !== undefined) ? 0.4 : 0) + (colunas.descricao !== undefined ? 0.2 : 0);
  return { colunas, sinal, confiancaCabecalho: Math.round(pontos * 100) / 100, colunasNaoMapeadas };
}

const indice = (ref, cabecalho) => {
  if (ref === undefined || ref === null || ref === "") return -1;
  if (typeof ref === "number") return ref;
  const alvo = normalizarTexto(ref);
  return cabecalho.findIndex((c) => normalizarTexto(c) === alvo);
};

// Aplica um mapeamento (detectado, salvo ou feito à mão) a texto ou a uma tabela já dividida.
// mapeamento = { colunas: { data, valor | debito+credito, descricao, complemento?, identificador? },
//                sinal: "banco" (negativo = saiu) | "cartao" (positivo = compra, invertido para sair negativo),
//                separador?, linhaCabecalho? (índice; -1 = sem cabeçalho, colunas por número) }
// Saída: linhas = movimentos { data, valorCentavos (negativo = saiu), descricao, identificador, linha }.
export function aplicarMapeamento(entrada, mapeamento) {
  let tabela, cabecalho, inicio;
  if (Array.isArray(entrada)) { tabela = entrada; } else {
    const { texto } = typeof entrada === "string" ? { texto: entrada } : decodificar(entrada, { charsetDeclarado: charsetDeclaradoNosBytes(entrada) });
    tabela = dividirTabela(texto, mapeamento.separador ?? detectarSeparador(texto));
  }
  let lc = mapeamento.linhaCabecalho ?? acharCabecalho(tabela);
  // Colunas dadas por NOME mas sem cabeçalho detectado: a linha do cabeçalho é a primeira onde todos os nomes aparecem.
  const nomes = Object.values(mapeamento.colunas ?? {}).filter((v) => typeof v === "string").map(normalizarTexto);
  if (lc < 0 && nomes.length) lc = tabela.findIndex((l) => { const n = l.map(normalizarTexto); return nomes.every((x) => n.includes(x)); });
  if (lc >= 0) { cabecalho = tabela[lc]; inicio = lc + 1; } else { cabecalho = []; inicio = 0; }
  const col = Object.fromEntries(Object.entries(mapeamento.colunas ?? {}).map(([k, v]) => [k, indice(v, cabecalho)]));
  const linhas = [], erros = [];
  let ignoradas = 0;
  for (let i = inicio; i < tabela.length; i++) {
    const l = tabela[i];
    if (l.filter((c) => c !== "").length < 2) { ignoradas++; continue; }
    const pega = (k) => (col[k] >= 0 ? l[col[k]] ?? "" : "");
    const data = lerDataExtrato(pega("data"));
    let valor;
    if (col.valor >= 0) valor = lerCentavos(pega("valor"));
    else {
      const d = lerCentavos(pega("debito")), c = lerCentavos(pega("credito"));
      valor = d !== null && d !== 0 ? -Math.abs(d) : c !== null ? Math.abs(c) : null;
    }
    if (!data || valor === null) { erros.push({ linha: i + 1, motivo: !data ? "data_invalida" : "valor_invalido", celulas: l }); continue; }
    if (mapeamento.sinal === "cartao") valor = -valor;
    const desc = [pega("descricao"), pega("complemento")].filter(Boolean).join(" - ");
    linhas.push({ data, valorCentavos: valor, descricao: desc, identificador: pega("identificador") || null, saldoCentavos: col.saldo >= 0 ? lerCentavos(pega("saldo")) : null, linha: i + 1 });
  }
  return { linhas, erros, ignoradas, cabecalho, linhaCabecalho: lc };
}

// Leitura completa com detecção. `perfis` = perfis-base + os salvos pelo usuário (UI passa a lista).
export function lerCSV(entrada, { perfis = PERFIS_CSV_BASE } = {}) {
  const { texto, encoding } = typeof entrada === "string" ? { texto: entrada.replace(/^﻿/, ""), encoding: "texto" } : decodificar(entrada, { charsetDeclarado: charsetDeclaradoNosBytes(entrada) });
  const separador = detectarSeparador(texto);
  const tabela = dividirTabela(texto, separador);
  let linhaCabecalho = acharCabecalho(tabela);
  // Cabeçalho que não tem sinônimo nenhum ("Dia;Loja;Quanto") mas bate com um perfil salvo pela pessoa.
  if (linhaCabecalho < 0) linhaCabecalho = tabela.findIndex((l, i) => i < 40 && acharPerfil(perfis, l));
  const base = { encoding, separador, linhaCabecalho, tabela, cabecalho: linhaCabecalho >= 0 ? tabela[linhaCabecalho] : [], perfil: null };
  if (linhaCabecalho < 0) {
    return { ...base, linhas: [], erros: [], mapeamentoDetectado: { colunas: {}, sinal: "banco", separador }, confianca: 0, colunasNaoMapeadas: [], motivo: "cabecalho_nao_encontrado" };
  }
  const cabecalho = tabela[linhaCabecalho];
  const perfil = acharPerfil(perfis, cabecalho);
  const det = perfil ? { colunas: { ...perfil.mapeamento.colunas }, sinal: perfil.mapeamento.sinal, confiancaCabecalho: 1, colunasNaoMapeadas: [] } : detectarMapeamento(cabecalho);
  const mapeamento = { colunas: det.colunas, sinal: det.sinal, separador, linhaCabecalho };
  const r = aplicarMapeamento(tabela, mapeamento);
  const candidatas = r.linhas.length + r.erros.length;
  const taxa = candidatas ? r.linhas.length / candidatas : 0;
  const confianca = Math.round(det.confiancaCabecalho * taxa * 100) / 100;
  return { ...base, perfil: perfil?.id ?? null, linhas: r.linhas, erros: r.erros, ignoradas: r.ignoradas, mapeamentoDetectado: mapeamento, confianca, colunasNaoMapeadas: det.colunasNaoMapeadas };
}

// Perfis salvos pelo usuário: lista imutável; mesmo id ou mesmo cabeçalho substitui. A persistência
// (IndexedDB) é do núcleo/UI; aqui só a forma.
export function salvarPerfil(perfis, { id, nome, cabecalho, mapeamento }) {
  if (!id || !Array.isArray(cabecalho) || !mapeamento?.colunas) throw new Error("perfil incompleto");
  const novo = { id, nome: nome ?? id, cabecalho: cabecalho.map(normalizarTexto), mapeamento: { colunas: { ...mapeamento.colunas }, sinal: mapeamento.sinal ?? "banco" }, origem: "usuario" };
  const chave = novo.cabecalho.join("|");
  return [...perfis.filter((p) => p.id !== id && p.cabecalho.map(normalizarTexto).join("|") !== chave), novo];
}
export const removerPerfil = (perfis, id) => perfis.filter((p) => p.id !== id);
