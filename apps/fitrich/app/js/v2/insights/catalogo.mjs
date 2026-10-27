// O catálogo inteiro de regras de insight, na ordem em que são avaliadas. Para somar uma regra: criar em financas.mjs
// ou corpo.mjs, escrever o texto (pt-BR e en) no dicionário da tela e o teste dos dois lados do limiar.
import { REGRAS_CORPO } from "./corpo.mjs";
import { REGRAS_FINANCAS } from "./financas.mjs";

export const CATALOGO = Object.freeze([...REGRAS_FINANCAS, ...REGRAS_CORPO]);
export const porId = (id) => CATALOGO.find((r) => r.id === id) ?? null;
