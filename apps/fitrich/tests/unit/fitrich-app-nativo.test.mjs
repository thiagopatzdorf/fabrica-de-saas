// Empacotamento nativo do Fitrich (apps/fitrich-app): a casca Capacitor tem de continuar sendo "o mesmo app,
// sem rede, com o que é do aparelho como camada opcional". Cada teste descreve a falha que impede.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { montar } from "../../mobile/scripts/montar-www.mjs";
import { endurecer } from "../../mobile/scripts/endurecer-android.mjs";

const APP = new URL("../../mobile/", import.meta.url);
const ler = (p) => readFileSync(new URL(p, APP), "utf8");
const json = (p) => JSON.parse(ler(p));
const SITE = new URL("../../app/", import.meta.url);

test("capacitor.config: appId da loja, www como webDir e NENHUM server.url (o app não carrega site remoto)", () => {
  const c = json("capacitor.config.json");
  assert.equal(c.appId, "com.example.fitrich");
  assert.equal(c.webDir, "www");
  assert.equal(c.server?.url, undefined, "server.url transformaria o app num navegador de site, e a loja recusa");
  assert.equal(c.server?.cleartext, undefined, "sem tráfego sem criptografia");
  assert.equal(c.android?.allowMixedContent, false);
});

test("package.json: só plugins locais (sem push, sem câmera de rede, sem analytics) e Node 22 para o Capacitor 8", () => {
  const p = json("package.json");
  const deps = Object.keys(p.dependencies).sort();
  assert.deepEqual(deps, ["@capacitor/android", "@capacitor/core", "@capacitor/filesystem", "@capacitor/haptics", "@capacitor/ios", "@capacitor/local-notifications", "@capacitor/share"]);
  assert.match(p.engines.node, /22/);
  assert.equal(p.private, true);
});

test("o que o app nativo usa de plugin é exatamente o que nativo.mjs detecta (nenhum plugin sobrando nem faltando)", () => {
  const usados = new Set([...readFileSync(new URL("js/v2/plataforma/nativo.mjs", SITE), "utf8").matchAll(/plugin\("(\w+)"\)|guarda\("(\w+)"/g)].map((m) => m[1] ?? m[2]));
  assert.deepEqual([...usados].sort(), ["Filesystem", "Haptics", "LocalNotifications", "Share"]);
  const instalados = Object.keys(json("package.json").dependencies).filter((d) => !/core|android|ios/.test(d)).map((d) => d.split("/")[1].split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(""));
  assert.deepEqual(instalados.sort(), [...usados].sort());
});

test("montar-www: o pacote não leva service worker, _headers, sitemap nem screenshots, e leva todas as telas", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "www-"));
  try {
    const r = montar({ saida: tmp });
    for (const fora of ["sw.js", "_headers", "sitemap.xml", "robots.txt", "404.html", "screenshots"]) assert.equal(existsSync(path.join(tmp, fora)), false, fora);
    for (const dentro of ["index.html", "en/index.html", "js/app.mjs", "js/v2/ui/telas/aparelho.mjs", "js/v2/plataforma/nativo.mjs", "css/aparelho.css", "icons/icon-512.png", "privacidade/index.html"]) assert.equal(existsSync(path.join(tmp, dentro)), true, dentro);
    assert.ok(r.arquivos > 100);
    const todos = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? todos(path.join(d, e.name)) : [path.join(d, e.name)]));
    assert.equal(todos(tmp).filter((f) => f.endsWith(".md")).length, 0, "README de pasta não vai no pacote");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("montar-www: links para pasta viram arquivo, porque o servidor local do WebView serve '/en/' como a página inicial", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "www-"));
  try {
    montar({ saida: tmp });
    assert.match(readFileSync(path.join(tmp, "index.html"), "utf8"), /href="\/en\/index\.html" lang="en"/);
    assert.match(readFileSync(path.join(tmp, "js/tema.js"), "utf8"), /"\/en\/index\.html"/);
    assert.match(readFileSync(path.join(tmp, "js/app.mjs"), "utf8"), /"\/privacidade\/index\.html"/);
    // a fonte do site NÃO foi tocada
    assert.match(readFileSync(new URL("index.html", SITE), "utf8"), /href="\/en\/" lang="en"/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("montar-www: se o app web mudar e um ajuste não achar mais o alvo, falha em vez de empacotar app com link quebrado", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "www-"));
  try {
    const fonte = path.join(tmp, "fonte");
    mkdirSync(path.join(fonte, "js"), { recursive: true }); mkdirSync(path.join(fonte, "en"));
    writeFileSync(path.join(fonte, "index.html"), "<html>sem link para o idioma</html>");
    assert.throws(() => montar({ saida: path.join(tmp, "saida"), fonte }), /não tem 1x href="\/en\/"/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("montar-www --csp: injeta a CSP do _headers como <meta> sem frame-ancestors (que não vale em meta) e com connect-src 'none'", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "www-"));
  try {
    montar({ saida: tmp, csp: true });
    const html = readFileSync(path.join(tmp, "index.html"), "utf8");
    const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    assert.ok(m, "meta CSP presente");
    assert.match(m[1], /connect-src 'none'/);
    assert.doesNotMatch(m[1], /frame-ancestors/);
    assert.match(readFileSync(path.join(tmp, "en/index.html"), "utf8"), /Content-Security-Policy/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("endurecer-android: tira INTERNET e alarme exato, é idempotente e não mexe no resto do manifesto", () => {
  const xml = `<?xml version="1.0" encoding="utf-8" ?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:allowBackup="true">\n    </application>\n\n    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n`;
  const a = endurecer(xml);
  assert.doesNotMatch(a, /permission\.INTERNET/);
  assert.match(a, /SCHEDULE_EXACT_ALARM" tools:node="remove"/);
  assert.match(a, /xmlns:tools=/);
  assert.match(a, /android:allowBackup="true"/);
  assert.equal(endurecer(a), a, "rodar duas vezes dá o mesmo");
});

test("twa: exemplo de assetlinks tem o mesmo pacote do app e deixa claro que a impressão digital é a da loja", () => {
  const al = json("twa/assetlinks.example.json");
  assert.equal(al[0].target.package_name, json("capacitor.config.json").appId);
  assert.equal(al[0].relation[0], "delegate_permission/common.handle_all_urls");
  assert.ok(al[0].target.sha256_cert_fingerprints.every((f) => f.startsWith("SUBSTITUA")), "nunca commitar impressão digital inventada");
  const t = json("twa/twa-manifest.example.json");
  assert.equal(t.packageId, json("capacitor.config.json").appId);
  assert.equal(t.host, "fitrich.example.com");
  assert.equal(t.enableNotifications, false);
});

test("ícones nativos: os recursos para o @capacitor/assets existem e o .gitignore guarda chaves de assinatura", () => {
  for (const f of ["icon-only.png", "icon-foreground.png", "icon-background.png", "splash.png", "splash-dark.png"]) assert.ok(existsSync(new URL(`assets/${f}`, APP)), f);
  const g = ler(".gitignore");
  for (const padrao of ["*.keystore", "*.jks", "*.p12", "*.mobileprovision", "www/"]) assert.ok(g.includes(padrao), padrao);
});
