// Dedupe de movimentos importados contra o que já está salvo. Reimportar o mesmo arquivo tem de dar
// ZERO novos: é o que deixa a pessoa importar sem medo todo mês.
//
// Chave, nesta ordem:
// 1. `fitid` do banco (por conta). FITID igual com a MESMA data e valor = já existe. FITID igual com
//    data ou valor DIFERENTE = lançamento novo (o banco reemitiu o id ao compensar: ofx-br documenta).
// 2. Sem fitid (CSV), `hash = sha256(contaId|data|centavos|descricaoNormalizada[|n])`, em que `n` só
//    entra a partir da 2ª linha IDÊNTICA dentro do mesmo arquivo (dois cafés iguais no mesmo dia
//    são dois lançamentos; reimportar o arquivo acha os dois pelo mesmo `n`).
// 3. Mesma data e valor, descrição diferente, sem fitid casando = `possivelDuplicata` (a pessoa decide).
import { normalizarTexto, sha256Hex } from "./comum.mjs";

export const chaveHash = (contaId, data, valorCentavos, descricao, n = 1) => `${contaId}|${data}|${valorCentavos}|${normalizarTexto(descricao)}${n > 1 ? `|${n}` : ""}`;

// Valor assinado de um lançamento do schema (despesa é negativo, receita positivo).
export const valorAssinado = (l) => l.valorCentavos ?? (l.tipo === "despesa" ? -Math.abs(l.centavos) : Math.abs(l.centavos));

// movimentos: saída do ofx/csv; existentes: lançamentos do schema v2 já salvos (qualquer conta: o
// filtro por conta/cartão é feito aqui). dono = { contaId } ou { cartaoId }.
export async function classificar(movimentos, existentes, dono, { digest } = {}) {
  const donoId = dono.contaId ?? dono.cartaoId;
  if (!donoId) throw new Error("informe contaId ou cartaoId");
  const daConta = existentes.filter((l) => (l.contaId ?? l.cartaoId) === donoId);
  const porFitid = new Map(), porHash = new Set(), porDataValor = new Map();
  for (const l of daConta) {
    if (l.fitid) porFitid.set(l.fitid, [...(porFitid.get(l.fitid) ?? []), l]);
    if (l.hash) porHash.add(l.hash);
    const k = `${l.data}|${valorAssinado(l)}`;
    porDataValor.set(k, [...(porDataValor.get(k) ?? []), l]);
  }
  const vistosNoArquivo = new Map();
  const saida = [];
  for (const m of movimentos) {
    const base = chaveHash(donoId, m.data, m.valorCentavos, m.descricao);
    const n = (vistosNoArquivo.get(base) ?? 0) + 1;
    vistosNoArquivo.set(base, n);
    const hash = await sha256Hex(chaveHash(donoId, m.data, m.valorCentavos, m.descricao, n), digest);
    const fitid = m.fitid ?? m.identificador ?? null;
    let status = "novo", existente = null, motivo = null;
    // O mesmo FITID duas vezes NO MESMO ARQUIVO com data e valor iguais é reemissão idêntica do
    // banco (fixture SGML): a 2ª cópia não vira lançamento.
    const chaveFit = fitid ? `${fitid}|${m.data}|${m.valorCentavos}` : null;
    if (chaveFit && vistosNoArquivo.has(chaveFit)) { status = "jaExiste"; motivo = "fitid_repetido_no_arquivo"; }
    if (chaveFit) vistosNoArquivo.set(chaveFit, 1);
    if (status === "novo" && fitid && porFitid.has(fitid)) {
      const iguais = porFitid.get(fitid).filter((l) => l.data === m.data && valorAssinado(l) === m.valorCentavos);
      if (iguais.length) { status = "jaExiste"; existente = iguais[0]; motivo = "fitid"; }
      else motivo = "fitid_reemitido";
    }
    if (status === "novo" && porHash.has(hash)) { status = "jaExiste"; motivo = "hash"; existente = daConta.find((l) => l.hash === hash) ?? null; }
    if (status === "novo") {
      const parecidos = (porDataValor.get(`${m.data}|${m.valorCentavos}`) ?? []).filter((l) => normalizarTexto(l.descricao) !== normalizarTexto(m.descricao) && !(fitid && l.fitid && l.fitid !== fitid));
      if (parecidos.length) { status = "possivelDuplicata"; existente = parecidos[0]; motivo = "mesma_data_valor"; }
    }
    saida.push({ ...m, fitid, hash, status, motivo, existenteId: existente?.id ?? null });
  }
  return saida;
}
