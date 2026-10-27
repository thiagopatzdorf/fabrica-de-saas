// Baixa do pacote oficial @vladmandic/human@3.3.6 (npm, MIT) a biblioteca de rosto e os modelos e confere o SHA-256
// de cada arquivo. Os modelos NÃO estão neste repositório: a licença de cada peso é herdada da fonte original
// (ver THIRD_PARTY.md) e o do anti-spoofing não pôde ser confirmado. Quem baixa assume essa verificação.
//   node scripts/baixar-modelos.mjs        (precisa de rede e do `tar` do sistema)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const URL_TGZ = "https://registry.npmjs.org/@vladmandic/human/-/human-3.3.6.tgz";
const ESPERADO = {
  "dist/human.esm.js": "e7c85047fb9492bd983b43d5217b54e9fb44393966f4c5db7c7ced1fdaf1fd9e",
  "models/antispoof.json": "7fd698ae1cebabbcad79d3b8b448587b0365eb7911987418231bdcf36583112a",
  "models/antispoof.bin": "4490fecb2becdb6869edc7e60f5e59962be013a8def8719b1373afb0f905c094",
  "models/blazeface.json": "cd7bbfc078270572beb39f9e5ae67aadbd50b5e67cff37e6d4f6b3ea39312e5f",
  "models/blazeface.bin": "dc9a97fdc50bc43216554bdd69aa3e7b9361a519ee7bdd996a2f69a98a6f9b72",
  "models/facemesh.json": "b60ca26f404724f43bd2b1575761d8265180e1f053cc0731caa68462927309e7",
  "models/facemesh.bin": "3826da640b0a3021161605369ee6af293f75d518040355b960ec71a3390c1c0b",
  "models/faceres.json": "5b83d49c0385d2e68a05122441b94226313677cae9fcc40b9587ad50079eb4df",
  "models/faceres.bin": "2c7d2d62b76c97528b736527aa09d310ea71743c9e3e79fb6c62d4b2d73af79b",
  "models/liveness.json": "9e51c8acf83b80abbf329b2735309ab5c90611c66905ade8b1bd130d473df9c8",
  "models/liveness.bin": "fc6a6b6b3b9721bdb8bff67a457a15b7cbfd81715cfb27f3e65b757e81dd663e",
};
const tmp = mkdtempSync(join(tmpdir(), "human-"));
try {
  const r = await fetch(URL_TGZ);
  if (!r.ok) throw new Error(`download falhou: HTTP ${r.status}`);
  writeFileSync(join(tmp, "h.tgz"), Buffer.from(await r.arrayBuffer()));
  execFileSync("tar", ["xzf", join(tmp, "h.tgz"), "-C", tmp]);
  mkdirSync(join(RAIZ, "site/app/modelos"), { recursive: true });
  mkdirSync(join(RAIZ, "site/app/vendor"), { recursive: true });
  for (const [arq, sha] of Object.entries(ESPERADO)) {
    const origem = join(tmp, "package", arq);
    const obtido = createHash("sha256").update(readFileSync(origem)).digest("hex");
    if (obtido !== sha) throw new Error(`SHA-256 de ${arq} não confere (esperado ${sha.slice(0, 12)}…, veio ${obtido.slice(0, 12)}…). Nada foi instalado deste arquivo.`);
    copyFileSync(origem, join(RAIZ, arq.startsWith("dist/") ? "site/app/vendor/human.esm.js" : `site/app/modelos/${arq.slice(7)}`));
  }
  copyFileSync(join(RAIZ, "third_party/LICENSE-human.txt"), join(RAIZ, "site/app/vendor/LICENSE-human.txt"));
  console.log(`ok: ${Object.keys(ESPERADO).length} arquivos conferidos e copiados para site/app/{vendor,modelos}`);
} finally { rmSync(tmp, { recursive: true, force: true }); }
