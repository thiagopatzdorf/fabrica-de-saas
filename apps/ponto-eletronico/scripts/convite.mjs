// Gera o link de instalação de um cliente novo (convite assinado, uso único, vale 72 h por padrão).
//   SEGREDO=<o mesmo segredo do Worker> node scripts/convite.mjs https://seu-dominio.exemplo [horas]
// O convite vai no fragmento (#...), que o navegador não manda ao servidor nem a log.
// Falha fechada: sem SEGREDO não gera nada.
import { convite } from "../servidor/worker.js";

const segredo = process.env.SEGREDO || "";
if (segredo.length < 16) { console.error("Defina SEGREDO (o mesmo do Worker, mínimo 16 caracteres)."); process.exit(1); }
const base = (process.argv[2] || "http://localhost:8790").replace(/\/+$/, "");
const horas = Number(process.argv[3]) || 72;
console.log(`${base}/app/instalar#${await convite(segredo, horas)}`);
