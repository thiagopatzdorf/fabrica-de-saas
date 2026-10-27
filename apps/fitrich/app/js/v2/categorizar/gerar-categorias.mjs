// Regera categorias-br.mjs a partir de categorias-br.json. Um teste exige que os dois sejam idênticos.
import { readFileSync, writeFileSync } from "node:fs";
const aqui = new URL("./", import.meta.url);
const json = JSON.parse(readFileSync(new URL("categorias-br.json", aqui), "utf8"));
const cabecalho = readFileSync(new URL("categorias-br.mjs", aqui), "utf8").split("export default")[0];
writeFileSync(new URL("categorias-br.mjs", aqui), `${cabecalho}export default ${JSON.stringify(json, null, 1)};\n`);
