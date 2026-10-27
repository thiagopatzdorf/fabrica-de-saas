// Síncrono no <head>, antes da primeira pintura: tema, aparência e idioma guardados (módulo seria deferido e piscaria).
// Chaves: `gs-prisma-theme` (tema claro/escuro), `fitrich-idioma`, `fitrich-contraste`, `fitrich-texto`.
(function () {
  var d = document.documentElement, ls = null;
  try { ls = window.localStorage; } catch (e) { /* bloqueado: segue sem persistir */ }
  var tema = null;
  try { tema = ls && ls.getItem("gs-prisma-theme"); } catch (e) { /* idem */ }
  if (tema !== "light" && tema !== "dark") {
    tema = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  d.setAttribute("data-gs-theme", tema);
  // Barra do sistema na cor do tema escolhido.
  var tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute("content", tema === "dark" ? "#1a1917" : "#fbf9f4");

  // Alto contraste (pessoa ou sistema) e texto maior.
  var contraste = null, texto = null;
  try { contraste = ls && ls.getItem("fitrich-contraste"); texto = ls && ls.getItem("fitrich-texto"); } catch (e) { /* idem */ }
  if (contraste === "alto" || (contraste !== "normal" && window.matchMedia && window.matchMedia("(prefers-contrast: more)").matches)) {
    d.setAttribute("data-gs-contraste", "alto");
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/css/alto-contraste.css"; document.head.appendChild(l);
  }
  if (texto === "grande") d.setAttribute("data-gs-texto", "grande");

  var idioma = null;
  try { idioma = ls && ls.getItem("fitrich-idioma"); } catch (e) { /* idem */ }
  var atual = d.lang === "en" ? "en" : "pt-BR";
  if ((idioma === "en" || idioma === "pt-BR") && idioma !== atual) {
    var destino = idioma === "en" ? "/en/" : "/";
    // `replace`: a página errada não fica no histórico.
    window.location.replace(destino + window.location.hash);
  }
})();
