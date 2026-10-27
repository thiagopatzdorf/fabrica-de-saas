// Endurece o AndroidManifest do projeto gerado por `cap add android` (idempotente):
//   - remove a permissão INTERNET: o pacote não usa rede nenhuma (CSP connect-src 'none' no site; aqui é a loja
//     publicando a PROVA na ficha de permissões: o app nem pode abrir conexão);
//   - remove SCHEDULE_EXACT_ALARM, que o plugin de notificações locais declara: os lembretes do Fitrich são
//     inexatos (allowWhileIdle) e a Play restringe alarme exato a apps de alarme/agenda.
// Teste no aparelho ANTES de enviar à loja (o app tem de abrir e os lembretes disparar); se algo falhar,
// volte a permissão com `git checkout` do manifesto ou apague a linha `tools:node="remove"` correspondente.
//   node mobile/scripts/endurecer-android.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const MANIFESTO = path.resolve(AQUI, "..", "android", "app", "src", "main", "AndroidManifest.xml");
const TOOLS = 'xmlns:tools="http://schemas.android.com/tools"';
const EXATO = '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" tools:node="remove" />';

export function endurecer(xml) {
  let s = xml;
  s = s.replace(/[ \t]*<uses-permission android:name="android\.permission\.INTERNET"\s*\/>\s*\n?/g, "");
  if (!s.includes(TOOLS)) s = s.replace("<manifest ", `<manifest ${TOOLS} `);
  if (!s.includes(EXATO)) s = s.replace(/(\s*)<application/, `$1${EXATO}$1<application`);
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(MANIFESTO)) { console.error("sem android/: rode `npm run android:add` antes"); process.exit(1); }
  const antes = readFileSync(MANIFESTO, "utf8"), depois = endurecer(antes);
  writeFileSync(MANIFESTO, depois);
  console.log(depois === antes ? "manifesto já estava endurecido" : "manifesto endurecido: INTERNET e SCHEDULE_EXACT_ALARM fora");
}
