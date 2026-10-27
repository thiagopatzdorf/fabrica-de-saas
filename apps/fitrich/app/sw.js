// Service worker do Fitrich, escrito à mão (sem Workbox): offline-first, versionado pelo CONTEÚDO.
//
// Regras (plano v2, área app/offline):
// - A lista de pré-cache e o nome do cache vêm de scripts/fitrich_plataforma.py (hash do
//   conteúdo de todos os arquivos do app, telas e dicionários inclusos): mudou um byte, muda o cache.
//   Todas as telas ficam pré-cacheadas de uma vez: é isso que garante o app inteiro sem internet já
//   na primeira visita, não só as telas que a pessoa abriu.
// - Pré-cache e página: cache-first. A versão é a do cache, então o arquivo nunca "envelhece" por dentro.
// - O que NÃO está na lista (não deveria haver, mas um arquivo novo esquecido existe): stale-while-
//   revalidate num cache de tempo de execução do MESMO hash, que morre junto com a versão.
// - SEM skipWaiting automático: a versão nova espera em `waiting` até a página mandar "skipWaiting"
//   (botão "Atualizar"). Reload surpresa perderia o que a pessoa estava digitando.
// - `activate` apaga todo cache `fitrich-*` que não seja o desta versão. Os dados da pessoa (banco e
//   preferências do navegador) NUNCA são tocados aqui: o worker só serve arquivos; migração de schema é do app.
// - Os pedidos do pré-cache vão com cache: "reload" para não aceitar uma cópia velha do cache HTTP.

/* gen:precache */
// Gerado por scripts/fitrich_plataforma.py build: não edite à mão.
const CACHE = "fitrich-f2b726cc09a7";
const PRECACHE = [
  "/",
  "/404.html",
  "/css/404.css",
  "/css/_telas.css",
  "/css/alto-contraste.css",
  "/css/aparelho.css",
  "/css/app.css",
  "/css/cartoes.css",
  "/css/checkin.css",
  "/css/componentes.css",
  "/css/corpo.css",
  "/css/dados.css",
  "/css/dividas.css",
  "/css/financas-comum.css",
  "/css/financas.css",
  "/css/hoje.css",
  "/css/importar.css",
  "/css/insights.css",
  "/css/lancar.css",
  "/css/legal.css",
  "/css/metas.css",
  "/css/nutricao.css",
  "/css/onboarding.css",
  "/css/patrimonio.css",
  "/css/plano.css",
  "/css/regras.css",
  "/css/revisao.css",
  "/css/shape.css",
  "/css/treino.css",
  "/en/",
  "/en/manifest.webmanifest",
  "/en/privacy/",
  "/favicon.svg",
  "/fonts/manrope.woff2",
  "/fonts/sora.woff2",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon-monochrome-512.png",
  "/js/app.mjs",
  "/js/dados.mjs",
  "/js/datas.mjs",
  "/js/financas.mjs",
  "/js/graficos.mjs",
  "/js/placar.mjs",
  "/js/shape.mjs",
  "/js/tema.js",
  "/js/v2/armazem.mjs",
  "/js/v2/arquivo.mjs",
  "/js/v2/cambio.mjs",
  "/js/v2/cartao.mjs",
  "/js/v2/categorizar/aprender.mjs",
  "/js/v2/categorizar/categorias-br.json",
  "/js/v2/categorizar/categorias-br.mjs",
  "/js/v2/categorizar/gerar-categorias.mjs",
  "/js/v2/categorizar/regras.mjs",
  "/js/v2/corpo/agua.mjs",
  "/js/v2/corpo/bemestar.mjs",
  "/js/v2/corpo/composicao.mjs",
  "/js/v2/corpo/fotos.mjs",
  "/js/v2/corpo/recuperacao.mjs",
  "/js/v2/corpo/relatorio.mjs",
  "/js/v2/corpo/sono.mjs",
  "/js/v2/corpo/tendencia.mjs",
  "/js/v2/cripto.mjs",
  "/js/v2/cripto.worker.mjs",
  "/js/v2/dividas.mjs",
  "/js/v2/esquema.mjs",
  "/js/v2/feriados.mjs",
  "/js/v2/fluxo.mjs",
  "/js/v2/gastar-hoje.mjs",
  "/js/v2/importar/comum.mjs",
  "/js/v2/importar/csv.mjs",
  "/js/v2/importar/dedupe.mjs",
  "/js/v2/importar/ofx.mjs",
  "/js/v2/importar/preview.mjs",
  "/js/v2/importar/transferencias.mjs",
  "/js/v2/indices.mjs",
  "/js/v2/insights/apresentar.mjs",
  "/js/v2/insights/base.mjs",
  "/js/v2/insights/catalogo.mjs",
  "/js/v2/insights/corpo.mjs",
  "/js/v2/insights/equilibrio.mjs",
  "/js/v2/insights/financas.mjs",
  "/js/v2/insights/motor.mjs",
  "/js/v2/insights/revisao.mjs",
  "/js/v2/investimentos.mjs",
  "/js/v2/lancamentos-soma.mjs",
  "/js/v2/lembrete-backup.mjs",
  "/js/v2/metas.mjs",
  "/js/v2/migracao.mjs",
  "/js/v2/nutricao/alimentos.mjs",
  "/js/v2/nutricao/base-alimentos.mjs",
  "/js/v2/nutricao/diario.mjs",
  "/js/v2/nutricao/energia.mjs",
  "/js/v2/nutricao/tendencia.mjs",
  "/js/v2/orcamento.mjs",
  "/js/v2/parcelas.mjs",
  "/js/v2/patrimonio.mjs",
  "/js/v2/plano.mjs",
  "/js/v2/plataforma/detectar.mjs",
  "/js/v2/plataforma/instalar.mjs",
  "/js/v2/plataforma/nativo.mjs",
  "/js/v2/plataforma/persistencia.mjs",
  "/js/v2/plataforma/plataforma.i18n.mjs",
  "/js/v2/plataforma/pwa.mjs",
  "/js/v2/plataforma/servico.mjs",
  "/js/v2/plataforma/shell.mjs",
  "/js/v2/recorrencia.mjs",
  "/js/v2/shape-financas.mjs",
  "/js/v2/taxas.mjs",
  "/js/v2/treino/cardio.mjs",
  "/js/v2/treino/catalogo.mjs",
  "/js/v2/treino/constantes.mjs",
  "/js/v2/treino/exemplo.mjs",
  "/js/v2/treino/formulas.mjs",
  "/js/v2/treino/programas.mjs",
  "/js/v2/treino/progressao.mjs",
  "/js/v2/treino/recordes.mjs",
  "/js/v2/treino/sessao.mjs",
  "/js/v2/tributos.mjs",
  "/js/v2/ui/aparencia-ui.mjs",
  "/js/v2/ui/aparencia.i18n.mjs",
  "/js/v2/ui/app.i18n.mjs",
  "/js/v2/ui/cartao-para-olhar.mjs",
  "/js/v2/ui/conta-padrao.mjs",
  "/js/v2/ui/ctx.mjs",
  "/js/v2/ui/dados-exemplo.mjs",
  "/js/v2/ui/estado-vazio.mjs",
  "/js/v2/ui/fmt.mjs",
  "/js/v2/ui/graficos-financas.mjs",
  "/js/v2/ui/graficos-patrimonio.mjs",
  "/js/v2/ui/graficos-plano.mjs",
  "/js/v2/ui/h.mjs",
  "/js/v2/ui/i18n.mjs",
  "/js/v2/ui/icones.mjs",
  "/js/v2/ui/insights-ui.mjs",
  "/js/v2/ui/insumos-hoje.mjs",
  "/js/v2/ui/onboarding.i18n.mjs",
  "/js/v2/ui/onboarding.mjs",
  "/js/v2/ui/parser-lancamento.mjs",
  "/js/v2/ui/preferencias.mjs",
  "/js/v2/ui/slots-hoje.mjs",
  "/js/v2/ui/telas/_comum.mjs",
  "/js/v2/ui/telas/aparelho.i18n.mjs",
  "/js/v2/ui/telas/aparelho.mjs",
  "/js/v2/ui/telas/cartoes.i18n.mjs",
  "/js/v2/ui/telas/cartoes.mjs",
  "/js/v2/ui/telas/checkin.i18n.mjs",
  "/js/v2/ui/telas/checkin.mjs",
  "/js/v2/ui/telas/corpo.i18n.mjs",
  "/js/v2/ui/telas/corpo.mjs",
  "/js/v2/ui/telas/dados.i18n.mjs",
  "/js/v2/ui/telas/dados.mjs",
  "/js/v2/ui/telas/dividas.i18n.mjs",
  "/js/v2/ui/telas/dividas.mjs",
  "/js/v2/ui/telas/financas-comum.mjs",
  "/js/v2/ui/telas/financas.i18n.mjs",
  "/js/v2/ui/telas/financas.mjs",
  "/js/v2/ui/telas/hoje-insights.mjs",
  "/js/v2/ui/telas/hoje.i18n.mjs",
  "/js/v2/ui/telas/hoje.mjs",
  "/js/v2/ui/telas/importar.i18n.mjs",
  "/js/v2/ui/telas/importar.mjs",
  "/js/v2/ui/telas/indice.mjs",
  "/js/v2/ui/telas/lancar.i18n.mjs",
  "/js/v2/ui/telas/lancar.mjs",
  "/js/v2/ui/telas/metas.i18n.mjs",
  "/js/v2/ui/telas/metas.mjs",
  "/js/v2/ui/telas/nutricao.i18n.mjs",
  "/js/v2/ui/telas/nutricao.mjs",
  "/js/v2/ui/telas/patrimonio.i18n.mjs",
  "/js/v2/ui/telas/patrimonio.mjs",
  "/js/v2/ui/telas/plano.i18n.mjs",
  "/js/v2/ui/telas/plano.mjs",
  "/js/v2/ui/telas/regras.i18n.mjs",
  "/js/v2/ui/telas/regras.mjs",
  "/js/v2/ui/telas/revisao.i18n.mjs",
  "/js/v2/ui/telas/revisao.mjs",
  "/js/v2/ui/telas/shape.i18n.mjs",
  "/js/v2/ui/telas/shape.mjs",
  "/js/v2/ui/telas/treino.i18n.mjs",
  "/js/v2/ui/telas/treino.mjs",
  "/js/v2/ui/telas/treino/biblioteca.mjs",
  "/js/v2/ui/telas/treino/cardio.mjs",
  "/js/v2/ui/telas/treino/comum.mjs",
  "/js/v2/ui/telas/treino/progresso.mjs",
  "/js/v2/ui/telas/treino/rotinas.mjs",
  "/js/v2/ui/telas/treino/treinar.mjs",
  "/js/v2/ui/vazios.i18n.mjs",
  "/manifest.webmanifest",
  "/privacidade/"
];
/* /gen */

const RUNTIME = CACHE.replace("fitrich-", "fitrich-rt-");

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith("fitrich-") && n !== CACHE && n !== RUNTIME).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
  // A página pergunta qual versão está ativa (tela "App e aparelho").
  if (e.data === "versao" && e.source) e.source.postMessage({ tipo: "versao", cache: CACHE, arquivos: PRECACHE.length });
});

// `/index.html` é pedido como `/`; `/en` e `/en/index.html` como `/en/`. Query e hash não entram na chave.
function chaveDe(caminho) {
  if (caminho.endsWith("/index.html")) return caminho.slice(0, -"index.html".length);
  return caminho === "/en" ? "/en/" : caminho;
}

async function responder(req, url) {
  const chave = chaveDe(url.pathname);
  const c = await caches.open(CACHE);
  const guardado = await c.match(chave);
  if (guardado) return guardado;
  if (req.mode === "navigate") {
    // Fora da lista: tenta a rede (404 de verdade online); sem rede, cai na página do app, que sabe rotear.
    try { return await fetch(req); } catch { return (await c.match(chave.startsWith("/en/") ? "/en/" : "/")) || Response.error(); }
  }
  const rt = await caches.open(RUNTIME);
  const velho = await rt.match(req);
  const rede = fetch(req).then((r) => { if (r.ok) rt.put(req, r.clone()); return r; });
  if (velho) { rede.catch(() => {}); return velho; }
  return rede;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Só a própria origem e só GET: o resto segue o caminho normal do navegador (e a CSP da página,
  // connect-src 'none', já barra o que tentar sair).
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(responder(e.request, url));
});
