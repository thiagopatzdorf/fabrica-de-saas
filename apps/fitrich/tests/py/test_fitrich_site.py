"""Guarda das páginas estáticas do Fitrich (app/).

A URL pública vem de FITRICH_BASE_URL (ver scripts/fitrich_build.py). Aqui se confere: cabeçalho de SEO (nas DUAS páginas, `/` e `/en/`),
nada de terceiro (o app promete que os dados não saem do aparelho), CSP-pronto (sem
<style>, sem <script> inline, sem `style=`), peso da carga inicial e arquivos que a
página pede. Só biblioteca padrão: o CI do site não tem pacotes.
"""
import json
import re
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
from fitrich_build import BASE  # noqa: E402

FITRICH = RAIZ / "app"
PAGINAS = {"pt-BR": (FITRICH / "index.html").read_text(encoding="utf-8"),
           "en": (FITRICH / "en" / "index.html").read_text(encoding="utf-8")}
PAGINA = PAGINAS["pt-BR"]
TETO_INICIAL = 120_000
TETO_HOJE = 90_000


def grafo_de_imports(entrada: Path, vistos=None) -> set[Path]:
    """Fecho dos `import ... from "./x.mjs"` ESTÁTICOS a partir de um módulo (o que o navegador baixa
    antes de executar). `import()` dinâmico fica de fora de propósito: é carga sob demanda."""
    vistos = vistos if vistos is not None else set()
    if entrada in vistos:
        return vistos
    vistos.add(entrada)
    texto = entrada.read_text(encoding="utf-8")
    for ref in re.findall(r'^\s*(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"', texto, flags=re.M):
        if ref.startswith("."):
            grafo_de_imports((entrada.parent / ref).resolve(), vistos)
    return vistos


def peso(arquivos) -> int:
    return sum(p.stat().st_size for p in arquivos)


class FitrichSite(unittest.TestCase):
    def test_cabecalho_de_seo_completo_nas_duas_paginas(self):
        for idioma, pagina in PAGINAS.items():
            canonical = BASE + "/" + ("en/" if idioma == "en" else "")
            for trecho in (f'<link rel="canonical" href="{canonical}">', 'name="description"', 'property="og:title"',
                           'application/ld+json', f'lang="{idioma}"', 'name="viewport"',
                           f'<link rel="alternate" hreflang="pt-BR" href="{BASE}/">',
                           f'<link rel="alternate" hreflang="en" href="{BASE}/en/">',
                           f'<link rel="alternate" hreflang="x-default" href="{BASE}/">'):
                self.assertIn(trecho, pagina, f"{idioma}: {trecho}")
            self.assertLessEqual(len(re.search(r'name="description" content="([^"]+)"', pagina).group(1)), 170)
            ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', pagina, re.S).group(1))
            self.assertEqual(ld["inLanguage"], idioma)
            self.assertEqual(ld["url"], canonical)

    def test_nada_de_terceiro_porque_a_promessa_e_dado_no_aparelho(self):
        codigo = PAGINA + "".join(p.read_text(encoding="utf-8") for p in FITRICH.rglob("*.mjs"))
        for pagina in PAGINAS.values():
            self.assertEqual(re.findall(r'(?:src|href)="https?://(?!' + re.escape(BASE.split("//")[1]) + r')[^"]+"', pagina), [])
        for proibido in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "googletagmanager", "innerHTML = d."):
            self.assertNotIn(proibido, codigo, proibido)

    def test_csp_pronta_sem_style_nem_script_inline(self):
        # A política virá com `style-src 'self'` e `script-src 'self'`: nada inline sobrevive a ela.
        for idioma, pagina in PAGINAS.items():
            self.assertNotIn("<style", pagina, idioma)
            self.assertNotIn(" style=", pagina, idioma)
            for script in re.findall(r"<script([^>]*)>", pagina):
                self.assertTrue('src="' in script or 'type="application/ld+json"' in script, f"{idioma}: script inline {script!r}")
            self.assertIn('<script src="/js/tema.js"></script>', pagina, "tema aplicado antes da pintura, por script clássico no <head>")
            self.assertLess(pagina.index('src="/js/tema.js"'), pagina.index('rel="stylesheet"'), "tema.js vem antes do CSS para não piscar")
        tema = (FITRICH / "js" / "tema.js").read_text(encoding="utf-8")
        self.assertNotIn("import ", tema, "tema.js é clássico e síncrono, não módulo")
        for css in (FITRICH / "css").glob("*.css"):
            self.assertNotIn("@import", css.read_text(encoding="utf-8"), css.name)

    def test_arquivos_pedidos_pela_pagina_existem(self):
        for pagina in PAGINAS.values():
            for ref in re.findall(r'(?:src|href)="(/[^"#?]+)"', pagina):
                if ref not in ("/", "/en/"):
                    self.assertTrue((FITRICH / ref.lstrip("/")).exists(), ref)
        for tela in (FITRICH / "js" / "v2" / "ui" / "telas").glob("*.mjs"):
            texto = tela.read_text(encoding="utf-8")
            for ref in re.findall(r'(?:css|i18n):\s*"(/[^"]+)"', texto):
                self.assertTrue((FITRICH / ref.lstrip("/")).exists(), f"{tela.name} pede {ref}")

    def test_peso_da_carga_inicial(self):
        # Carga inicial = HTML + CSS do shell + tema.js + app.mjs e tudo o que ele importa ESTATICAMENTE.
        # A v2 substitui dados.mjs/financas.mjs/app.mjs v1 nesse caminho;
        # as telas entram sob demanda e têm o próprio teto abaixo. O teto de 120 KB não mudou.
        inicial = grafo_de_imports(FITRICH / "js" / "app.mjs") | {FITRICH / "js" / "tema.js", FITRICH / "css" / "app.css", FITRICH / "js" / "v2" / "ui" / "app.i18n.mjs"}
        total = len(PAGINA.encode()) + peso(inicial)
        self.assertLess(total, TETO_INICIAL, f"carga inicial (HTML + CSS + {len(inicial)} módulos) = {total} bytes")
        self.assertNotIn(FITRICH / "js" / "financas.mjs", inicial, "financas.mjs v1 não entra mais na carga inicial")
        # Primeira tela (Hoje) e folha Lançar: o que chega logo depois, cada uma com CSS e dicionário.
        for nome, teto in (("hoje", TETO_HOJE), ("lancar", TETO_HOJE)):
            modulo = FITRICH / "js" / "v2" / "ui" / "telas" / f"{nome}.mjs"
            extra = (grafo_de_imports(modulo) - inicial) | {FITRICH / "css" / f"{nome}.css", FITRICH / "js" / "v2" / "ui" / "telas" / f"{nome}.i18n.mjs"}
            self.assertLess(peso(extra), teto, f"{nome}: {peso(extra)} bytes além do shell")

    def test_sitemap_e_robots_apontam_para_a_url_base(self):
        sitemap = (FITRICH / "sitemap.xml").read_text()
        self.assertIn(f"<loc>{BASE}/</loc>", sitemap)
        self.assertIn(f"<loc>{BASE}/en/</loc>", sitemap)
        self.assertIn('hreflang="en"', sitemap)
        self.assertIn(f"{BASE}/sitemap.xml", (FITRICH / "robots.txt").read_text())

    def test_modulos_v1_que_a_tela_shape_reusa_continuam_no_lugar(self):
        for nome in ("shape.mjs", "placar.mjs", "graficos.mjs", "dados.mjs", "financas.mjs", "datas.mjs"):
            self.assertTrue((FITRICH / "js" / nome).exists(), nome)


if __name__ == "__main__":
    unittest.main()
