"""`fitrich_build.py` gera `/` e `/en/` de um template: o HTML commitado tem de ser o que o template
gera (senão alguém editou o gerado à mão e a próxima build apaga), e cada página tem lang, title,
description, canonical, og:locale e inLanguage do próprio idioma, com hreflang recíproco."""
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
import fitrich_build  # noqa: E402


class FitrichBuild(unittest.TestCase):
    def test_html_commitado_e_o_que_o_template_gera(self):
        for caminho, conteudo in fitrich_build.saidas().items():
            self.assertEqual(caminho.read_text(encoding="utf-8"), conteudo, f"{caminho.name} difere: rode python3 scripts/fitrich_build.py")

    def test_cada_idioma_tem_os_proprios_metadados_e_hreflang_reciproco(self):
        pt, en = fitrich_build.render("pt-BR"), fitrich_build.render("en")
        self.assertIn('<html lang="pt-BR"', pt)
        self.assertIn('<html lang="en"', en)
        self.assertNotEqual(re.search(r"<title>(.*?)</title>", pt).group(1), re.search(r"<title>(.*?)</title>", en).group(1))
        self.assertNotEqual(re.search(r'name="description" content="([^"]+)"', pt).group(1), re.search(r'name="description" content="([^"]+)"', en).group(1))
        self.assertIn(f'<link rel="canonical" href="{fitrich_build.BASE}/">', pt)
        self.assertIn(f'<link rel="canonical" href="{fitrich_build.BASE}/en/">', en)
        self.assertIn('property="og:locale" content="pt_BR"', pt)
        self.assertIn('property="og:locale" content="en_US"', en)
        self.assertIn('"inLanguage": "pt-BR"', pt)
        self.assertIn('"inLanguage": "en"', en)
        for pagina in (pt, en):
            self.assertIn(f'hreflang="pt-BR" href="{fitrich_build.BASE}/"', pagina)
            self.assertIn(f'hreflang="en" href="{fitrich_build.BASE}/en/"', pagina)
            self.assertIn(f'hreflang="x-default" href="{fitrich_build.BASE}/"', pagina)
        self.assertIn('data-idioma="pt-BR" aria-current="page"', pt)
        self.assertIn('data-idioma="en" aria-current="page"', en)
        self.assertNotIn('data-idioma="en" aria-current', pt)

    def test_texto_do_dicionario_e_escapado_e_o_jsonld_nao_fecha_a_tag(self):
        original = fitrich_build.IDIOMAS["en"]["app_nome"]
        try:
            fitrich_build.IDIOMAS["en"]["app_nome"] = 'A<b>"x"</script>'
            pagina = fitrich_build.render("en")
            self.assertIn("A&lt;b&gt;&quot;x&quot;&lt;/script&gt;", pagina)
            self.assertNotIn('<b>"x"</script>', pagina)
        finally:
            fitrich_build.IDIOMAS["en"]["app_nome"] = original
        self.assertNotIn("</script>", fitrich_build.jsonld("en", {**fitrich_build.IDIOMAS["en"], "jsonld_description": "x</script><b>"}))

    def test_placeholder_sem_valor_para_a_build(self):
        template = fitrich_build.TEMPLATE
        original = template.read_text(encoding="utf-8")
        self.assertEqual(original.count("{{"), original.count("}}"))
        chaves = set(re.findall(r"\{\{(\w+)\}\}", original))
        conhecidas = set(fitrich_build.IDIOMAS["pt-BR"]) | {"lang", "base", "jsonld", "atual_pt", "atual_en"}
        self.assertEqual(chaves - conhecidas, set(), "placeholder no template sem valor no dicionário")

    def test_sitemap_lista_as_duas_paginas_com_alternates(self):
        s = fitrich_build.sitemap()
        self.assertEqual(s.count("<url>"), 2)
        self.assertEqual(s.count('hreflang="x-default"'), 2)


if __name__ == "__main__":
    unittest.main()
