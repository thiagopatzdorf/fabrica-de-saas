// Do insight (números crus) para os parâmetros do texto traduzido. Pura (recebe o `fmt` e a função de nome de categoria):
// a regra de formatação mora aqui e não nas telas, para o cartão da Hoje e a tela Revisão falarem igual.
// Convenção dos nomes em `numeros`: terminam em `Centavos` → dinheiro; `Bp` → percentual; `categoriaId` → nome da
// categoria; `tipo` → nome do tipo de treino; `n` fica cru (escolhe o plural); o resto passa como está (número inteiro, ou 1 casa se fracionário).
export function parametrosDoInsight(i, fmt, nomeCategoria = (id) => id, nomeTipo = (x) => x) {
  const p = {};
  for (const [k, v] of Object.entries(i.numeros ?? {})) {
    if (k.endsWith("Centavos")) p[k.slice(0, -8)] = fmt.moeda(v);
    else if (k.endsWith("Bp")) p[k.slice(0, -2)] = fmt.percentualBp(v, 0);
    else if (k === "n") p.n = v; // inteiro cru: é o que escolhe o plural (.one/.other)
    else if (k === "categoriaId") p.categoria = nomeCategoria(v);
    else if (k === "tipo") p.tipo = nomeTipo(v);
    else if (typeof v === "number") p[k] = fmt.numero(v, Number.isInteger(v) ? 0 : 1);
    else p[k] = String(v);
  }
  return p;
}
