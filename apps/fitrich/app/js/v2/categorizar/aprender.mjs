// Aprender com a correção: quando a pessoa troca a categoria de um lançamento importado, extraímos o
// TOKEN DOMINANTE da descrição normalizada e criamos uma regra `aprendida` (tipo `contem`). Sem
// modelo: a regra é texto que a pessoa lê, edita e apaga. Naive Bayes foi descartado no plano
// porque ninguém consegue explicar nem corrigir um peso.
import { normalizarDescricao, registrarAcerto } from "./regras.mjs";

// Palavras que aparecem em qualquer extrato e não identificam o estabelecimento.
export const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "a", "o", "as", "os", "no", "na", "nos", "nas", "um", "uma",
  "ltda", "sa", "s a", "me", "epp", "eireli", "cia", "comercio", "comercial", "servicos", "servico", "produtos", "industria",
  "pagamento", "pagto", "compra", "compras", "debito", "credito", "cartao", "pix", "ted", "doc", "transferencia", "transf", "enviado", "enviada", "recebido", "recebida",
  "parcela", "parc", "fatura", "lancamento", "tarifa", "saque", "deposito", "boleto", "titulo", "conta", "ref", "br", "brasil", "sp", "rj", "mg", "online", "loja", "app", "www", "com"]);

// Token mais informativo: o mais longo que não é palavra vazia (empate: o primeiro). Se nada sobrar
// com ≥3 letras, usa a descrição normalizada inteira (regra específica, mas ainda transparente).
export function tokenDominante(descricao) {
  const d = normalizarDescricao(descricao);
  if (!d) return null;
  const tokens = d.split(" ").filter((t) => t.length >= 2 && !PALAVRAS_VAZIAS.has(t));
  if (!tokens.length) return d;
  const melhor = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  return melhor.length >= 3 || /^\d+$/.test(melhor) ? melhor : d;
}

// Correção → regras novas (lista imutável). Se já existe regra `aprendida`/`usuario` com o mesmo padrão,
// ela é atualizada para a categoria corrigida (a pessoa mudou de ideia) e zera acertos.
// Devolve { regras, regra, padrao }.
export function aprender(regras, { descricao, categoriaId, categoriaNome = null }, { novoId }) {
  const padrao = tokenDominante(descricao);
  if (!padrao) return { regras, regra: null, padrao: null };
  const existente = regras.find((r) => r.tipo === "contem" && r.origem !== "base" && r.padrao === padrao);
  if (existente) {
    if (existente.categoriaId === categoriaId) return { regras: registrarAcerto(regras, existente.id), regra: existente, padrao };
    const regra = { ...existente, categoriaId, categoriaNome, acertos: 0 };
    return { regras: regras.map((r) => (r.id === existente.id ? regra : r)), regra, padrao };
  }
  const regra = { id: novoId(), padrao, tipo: "contem", categoriaId, categoriaNome, prioridade: 0, origem: "aprendida", acertos: 0 };
  return { regras: [...regras, regra], regra, padrao };
}

// Quando a pessoa ACEITA a categoria sugerida, a regra que sugeriu ganha um acerto: o contador é o
// que desempata regras concorrentes e o que a UI mostra ("acertou 12 vezes").
export const confirmarSugestao = (regras, regraId) => registrarAcerto(regras, regraId);
