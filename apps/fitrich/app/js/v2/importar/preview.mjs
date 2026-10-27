// Preview da importação e o objeto `importacao` que a torna reversível. Fluxo em três passos puros:
//   prepararImportacao → (a pessoa olha, marca duplicatas, confirma transferências) → aplicarImportacao
//   e, se se arrepender, desfazerImportacao remove SÓ os ids criados e devolve o estado idêntico.
// Nada aqui toca DOM, relógio ou aleatório: `agora` e `novoId` são injetados (regra 9 do plano).
import { sha256Hex } from "./comum.mjs";
import { classificar } from "./dedupe.mjs";
import { sugerirTransferencias } from "./transferencias.mjs";
import { categorizar } from "../categorizar/regras.mjs";

// Meio de pagamento deduzido da descrição/tipo do banco; "outro" quando não dá para saber.
export function inferirMeio(descricao, tipoBanco = null, dono = {}) {
  const d = String(descricao ?? "").toLowerCase();
  if (dono.cartaoId) return "credito";
  if (/\bpix\b/.test(d)) return "pix";
  if (/\bted\b|\bdoc\b|transf/.test(d)) return "outro";
  if (/boleto|convenio|convênio|pagamento de titulo|título/.test(d)) return "boleto";
  if (/debito|débito|cart[aã]o/.test(d) || tipoBanco === "POS") return "debito";
  if (/saque|dinheiro|atm/.test(d) || tipoBanco === "ATM") return "dinheiro";
  return "outro";
}

// movimento (ofx/csv, já classificado) → lançamento do schema v2.
export function movimentoParaLancamento(m, { dono, importacaoId, novoId, agora, regras = [] }) {
  const sugestao = regras.length ? categorizar(m.descricao, regras) : null;
  return {
    id: novoId(), data: m.data,
    tipo: m.valorCentavos < 0 ? "despesa" : "receita",
    centavos: Math.abs(m.valorCentavos),
    categoriaId: sugestao?.categoriaId ?? null,
    categoriaSugerida: sugestao ? { categoriaId: sugestao.categoriaId ?? null, categoriaNome: sugestao.categoriaNome ?? null, regraId: sugestao.regraId, origem: sugestao.origem } : null,
    descricao: String(m.descricao ?? ""), tags: [],
    ...(dono.cartaoId ? { cartaoId: dono.cartaoId } : { contaId: dono.contaId }),
    meio: inferirMeio(m.descricao, m.tipoBanco, dono), moeda: "BRL", status: "efetivado",
    origem: "importacao", importacaoId, fitid: m.fitid ?? null, hash: m.hash, atualizadoEm: agora(),
  };
}

// arquivo: { nome, bytes (ArrayBuffer|Uint8Array) | texto }. movimentos: saída de ofx/csv.
// dados: estado v2 (usa `lancamentos`). dono: { contaId } | { cartaoId }.
export async function prepararImportacao({ arquivo, movimentos, dados, dono, regras = [], novoId, agora, digest }) {
  if (typeof novoId !== "function" || typeof agora !== "function") throw new Error("injete novoId e agora");
  const importacaoId = novoId();
  const classificados = await classificar(movimentos, dados.lancamentos ?? [], dono, { digest });
  const ctx = { dono, importacaoId, novoId, agora, regras };
  const novos = [], jaExistem = [], possiveisDuplicatas = [];
  for (const c of classificados) {
    if (c.status === "novo") novos.push(movimentoParaLancamento(c, ctx));
    else if (c.status === "possivelDuplicata") possiveisDuplicatas.push({ ...movimentoParaLancamento(c, ctx), existenteId: c.existenteId });
    else jaExistem.push({ ...c });
  }
  // Transferências: os novos contra o que já existe em OUTRAS contas (e entre si, se o arquivo tiver duas contas).
  const transferenciasSugeridas = sugerirTransferencias([...novos, ...(dados.lancamentos ?? [])]).filter((s) => novos.some((n) => n.id === s.saidaId || n.id === s.entradaId));
  const hashArquivo = arquivo?.bytes ? await sha256Hex(arquivo.bytes, digest) : arquivo?.texto ? await sha256Hex(arquivo.texto, digest) : null;
  return {
    preview: {
      novos, jaExistem, possiveisDuplicatas, transferenciasSugeridas,
      totais: { n: novos.length, somaCentavos: novos.reduce((s, l) => s + (l.tipo === "despesa" ? -l.centavos : l.centavos), 0), jaExistem: jaExistem.length, possiveisDuplicatas: possiveisDuplicatas.length },
    },
    importacao: { id: importacaoId, arquivo: arquivo?.nome ?? null, hashArquivo, em: agora(), contaId: dono.contaId ?? null, cartaoId: dono.cartaoId ?? null, idsCriados: [] },
  };
}

// Aplica: entra tudo de `novos` mais as duplicatas que a pessoa marcou (`incluirDuplicatas` = ids).
// Devolve dados NOVOS (o original não é mexido), com `importacoes` registrando os ids criados.
export function aplicarImportacao(dados, { preview, importacao }, { incluirDuplicatas = [] } = {}) {
  const extras = preview.possiveisDuplicatas.filter((l) => incluirDuplicatas.includes(l.id)).map(({ existenteId, ...l }) => l);
  const criados = [...preview.novos, ...extras];
  const reg = { ...importacao, idsCriados: criados.map((l) => l.id) };
  return { ...dados, lancamentos: [...(dados.lancamentos ?? []), ...criados], importacoes: [...(dados.importacoes ?? []), reg] };
}

// Desfaz: remove só os ids criados por aquela importação e o próprio registro. Se nada mais mudou
// desde então, o resultado é idêntico ao estado anterior (teste). Lançamento pré-existente que a
// pessoa ligou a um removido por transferência fica com `refId` solto: limpamos o ponteiro.
export function desfazerImportacao(dados, importacaoId) {
  const reg = (dados.importacoes ?? []).find((i) => i.id === importacaoId);
  if (!reg) throw new Error("importação não encontrada");
  const remover = new Set(reg.idsCriados);
  const lancamentos = (dados.lancamentos ?? []).filter((l) => !remover.has(l.id)).map((l) => (l.refId && remover.has(l.refId) ? { ...l, refId: null } : l));
  return { ...dados, lancamentos, importacoes: dados.importacoes.filter((i) => i.id !== importacaoId) };
}
