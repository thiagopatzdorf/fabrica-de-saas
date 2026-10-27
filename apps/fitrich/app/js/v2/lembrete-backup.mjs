// Quando lembrar a pessoa de fazer backup. Dado local só existe num aparelho: o lembrete é a única
// defesa contra "troquei de celular e perdi tudo". Devolve códigos; a frase é da UI.
//   - nunca fez backup e já tem registro → backup.nunca_feito
//   - mais de 30 dias desde o último    → backup.mais_de_30_dias
//   - mais de 50 registros novos        → backup.mais_de_50_registros
//   - WebKit sem instalar (Safari apaga dados de site não usado em 7 dias): mais de 5 dias → backup.webkit_mais_de_5_dias
import { diasEntre } from "../datas.mjs";

export const LIMITE_DIAS = 30;
export const LIMITE_REGISTROS = 50;
export const LIMITE_DIAS_WEBKIT = 5;

export function precisaDeBackup({ ultimoBackupEm = null, registrosDesdeBackup = 0, hoje, webkitNaoInstalado = false }) {
  const codigos = [];
  const dia = typeof ultimoBackupEm === "string" ? ultimoBackupEm.slice(0, 10) : null;
  const dias = dia ? diasEntre(dia, hoje) : null;
  if (dia == null) { if (registrosDesdeBackup > 0) codigos.push("backup.nunca_feito"); }
  else {
    if (dias > LIMITE_DIAS) codigos.push("backup.mais_de_30_dias");
    if (webkitNaoInstalado && dias > LIMITE_DIAS_WEBKIT) codigos.push("backup.webkit_mais_de_5_dias");
  }
  if (registrosDesdeBackup > LIMITE_REGISTROS) codigos.push("backup.mais_de_50_registros");
  return { precisa: codigos.length > 0, codigos, dias, registros: registrosDesdeBackup };
}
