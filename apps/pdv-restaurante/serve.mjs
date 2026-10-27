// Servidor estático mínimo (sem dependências) para rodar o PDV: node serve.mjs [porta]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL(".", import.meta.url));
const porta = Number(process.argv[2] || process.env.PORT || 8080);
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

http.createServer(async (req, res) => {
  try {
    let caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (caminho.endsWith("/")) caminho += "index.html";
    const arq = normalize(join(raiz, caminho));
    // Por que: impede "../" de sair da pasta do app.
    if (!arq.startsWith(raiz) || /\/(tests|node_modules)\//.test(caminho)) throw new Error("fora");
    const corpo = await readFile(arq);
    res.writeHead(200, { "content-type": tipos[extname(arq)] || "application/octet-stream" });
    res.end(corpo);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("não encontrado");
  }
}).listen(porta, "127.0.0.1", () => console.log(`PDV em http://127.0.0.1:${porta}/`));
