// Tema: automático (segue o aparelho), claro ou escuro; a escolha fica neste aparelho (localStorage).
// Script clássico no <head>, antes do CSS pintar: sem ele a página piscaria no tema errado ao abrir.
(() => {
  const CHAVE = "ponto-tema", OPCOES = ["auto", "claro", "escuro"];
  const ROTULO = { auto: "Tema automático (segue o aparelho)", claro: "Tema claro", escuro: "Tema escuro" };
  const raiz = document.documentElement;
  let atual = "auto";
  try { atual = OPCOES.includes(localStorage.getItem(CHAVE)) ? localStorage.getItem(CHAVE) : "auto"; } catch { /* sem armazenamento: segue o aparelho */ }
  const aplicar = () => {
    if (atual === "auto") raiz.removeAttribute("data-tema"); else raiz.dataset.tema = atual;
    // Barra do navegador no celular acompanha o tema escolhido.
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      if (!m.dataset.media) m.dataset.media = m.media || "";
      m.media = atual === "auto" ? m.dataset.media : (m.dataset.media.includes("dark") === (atual === "escuro") ? "all" : "not all");
    }
    for (const b of document.querySelectorAll("[data-tema-botao]")) {
      b.dataset.estado = atual; b.setAttribute("aria-label", ROTULO[atual]); b.title = `${ROTULO[atual]}. Toque para trocar.`;
    }
  };
  aplicar();
  addEventListener("DOMContentLoaded", () => {
    aplicar();
    for (const b of document.querySelectorAll("[data-tema-botao]")) b.addEventListener("click", () => {
      atual = OPCOES[(OPCOES.indexOf(atual) + 1) % OPCOES.length];
      try { localStorage.setItem(CHAVE, atual); } catch { /* vale só nesta visita */ }
      aplicar();
    });
  });
})();
