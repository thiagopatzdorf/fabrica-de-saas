// Venda inteira no Chromium (Playwright), em 1440 e 390 px: abre o caixa, abre a mesa 3, lança itens,
// manda para a cozinha, paga com cartão + dinheiro com troco, emite a prévia da NFC-e e fecha o caixa.
// Uso: node tests/e2e.mjs http://127.0.0.1:8080 (PLAYWRIGHT=<pasta do módulo>, CHROMIUM=<exe>, SHOTS=<pasta>).
import { createRequire } from "node:module";

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const base = process.argv[2];
const SHOTS = process.env.SHOTS;
const nav = await pw.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const saida = {};
try {
  for (const largura of [1440, 390]) {
    const celular = largura < 600;
    const ctx = await nav.newContext({ viewport: { width: largura, height: celular ? 844 : 900 }, isMobile: celular, hasTouch: celular, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const erros = [];
    p.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
    p.on("pageerror", (e) => erros.push(String(e)));
    p.on("response", (r) => { if (r.status() >= 400) erros.push(`${r.status()} ${r.url()}`); });
    const r = {};


    await p.goto(`${base}/pdv.html`, { waitUntil: "networkidle" });
    await p.evaluate(() => localStorage.removeItem("pdv-restaurante-v1"));
    await p.reload({ waitUntil: "networkidle" });
    r.pdvRolagem = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    r.mesas = await p.$$eval(".mesa", (m) => m.length);

    // Sem caixa aberto, fechar conta é recusado.
    await p.click('[data-mesa="3"]');
    await p.click('[data-add="p2"]');
    await p.click('[data-acao="pagar"]');
    r.semCaixa = await p.textContent("#erro-comanda");
    await p.click('#dlg-comanda [data-acao="fechar-dlg"]');

    await p.click("#t-caixa");
    await p.fill('#form-abrir [name="fundo"]', "200,00");
    await p.click('#form-abrir button[type="submit"]');
    r.caixaAberto = await p.textContent("#caixa-st");

    await p.click("#t-salao");
    await p.click('[data-mesa="3"]');
    await p.click('[data-add="p2"]');           // 2× filé (um já estava)
    await p.click('[data-add="b3"]');
    await p.click('[data-add="b3"]');           // 2× suco
    await p.click('[data-acao="cozinha"]');
    r.totalMesa = await p.textContent("#cmd-totais dd.t");
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/pdv-comanda-${largura}.png` });
    await p.click('[data-acao="pagar"]');
    await p.click('[data-forma="credito"]');
    await p.fill("#pg-valor", "100,00");
    await p.click('[data-acao="add-pg"]');
    await p.click('[data-forma="pix"]');
    await p.fill("#pg-valor", "999,00");
    await p.click('[data-acao="add-pg"]');
    r.pixAcima = await p.textContent("#erro-pg");
    await p.click('[data-forma="dinheiro"]');
    await p.fill("#pg-valor", "60,00");
    await p.click('[data-acao="add-pg"]');
    r.troco = await p.textContent("#pg-resumo dd.troco");
    await p.fill("#pg-doc", "529.982.247-25");
    await p.click("#btn-finalizar");
    r.cupom = await p.textContent("#impressao");
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/pdv-cupom-${largura}.png` });
    await p.click('#dlg-cupom [data-acao="fechar-dlg"]');
    r.mesaLivre = await p.textContent('[data-mesa="3"] span');

    await p.click("#t-cozinha");
    r.kds = await p.$$eval(".tk", (t) => t.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
    await p.click("#t-relatorio");
    r.relatorio = await p.textContent(".kpis");
    await p.click("#t-caixa");
    r.gaveta = await p.textContent("#caixa .tot dd.t");
    await p.fill('#form-fechar [name="contado"]', "255,76");
    await p.click('#form-fechar button[type="submit"]');
    r.fechado = await p.textContent("#caixa");

    // Recarregar mantém o que foi feito (localStorage).
    await p.reload({ waitUntil: "networkidle" });
    await p.click("#t-relatorio");
    r.depoisDeRecarregar = await p.textContent(".kpis");
    r.erros = erros;
    saida[largura] = r;
    await ctx.close();
  }
} finally {
  await nav.close();
}
console.log(JSON.stringify(saida));
