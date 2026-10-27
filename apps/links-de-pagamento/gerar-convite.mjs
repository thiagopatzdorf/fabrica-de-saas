// Gera o link de uso único (72 h) de /configurar, onde você cola a chave restrita do Stripe.
// Uso: SESSAO_SEGREDO=<o mesmo segredo do Worker> node gerar-convite.mjs https://seu-dominio
// O segredo vem do ambiente (nunca como argumento) e não é impresso.
import { assinar, agora, aleatorio } from "./src/sessao.js";

const origem = (process.argv[2] || "").replace(/\/+$/, "");
const segredo = process.env.SESSAO_SEGREDO || "";
if (!/^https?:\/\//.test(origem) || segredo.length < 16) {
  console.error("uso: SESSAO_SEGREDO=<segredo do Worker, 16+ caracteres> node gerar-convite.mjs https://seu-dominio");
  process.exit(1);
}
const convite = await assinar({ c: "instalar", id: aleatorio(), exp: agora() + 72 * 3600 }, segredo);
console.log(`${origem}/configurar?convite=${convite}`);
