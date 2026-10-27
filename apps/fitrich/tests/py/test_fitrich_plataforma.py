"""Plataforma do Fitrich (área 5 do plano v2): CSP estrita, PWA e nada de rede.

Cada teste descreve a falha que impede. Tudo aqui é conferido estaticamente a partir
da pasta publicada (app/) e do `_headers`, com o leitor de
`_headers` de headers_estaticos.py. O teste de navegador real está em
test_fitrich_csp_chromium.py.
"""
import json
import re
import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))
sys.path.insert(0, str(AQUI))
import fitrich_plataforma as fp  # noqa: E402
import headers_estaticos as cf  # noqa: E402

FITRICH = RAIZ / "app"
HEADERS = (FITRICH / "_headers").read_text(encoding="utf-8")
PAGINAS = sorted(FITRICH.rglob("*.html"))
MODULOS = sorted(FITRICH.rglob("*.mjs")) + sorted(FITRICH.rglob("*.js"))
CSP_PAGINA = cf.cabecalhos_para(HEADERS, "/")["content-security-policy"]


def diretivas(csp: str) -> dict[str, str]:
    return {d.split()[0]: " ".join(d.split()[1:]) for d in csp.split(";") if d.strip()}


class CSP(unittest.TestCase):
    def test_csp_estrita_na_pagina_sem_unsafe_e_sem_rede(self):
        d = diretivas(CSP_PAGINA)
        self.assertEqual(d["default-src"], "'none'")
        self.assertEqual(d["connect-src"], "'none'", "connect-src 'none' é a prova técnica de 'nada sai do aparelho'")
        for chave in ("script-src", "style-src", "font-src", "manifest-src", "worker-src"):
            self.assertEqual(d[chave], "'self'", chave)
        self.assertEqual(d["img-src"], "'self' data: blob:", "blob: é só para a foto de progresso escolhida pela pessoa, mostrada localmente (tela Corpo)")
        for chave in ("base-uri", "form-action", "frame-ancestors"):
            self.assertEqual(d[chave], "'none'", chave)
        self.assertNotIn("unsafe-inline", CSP_PAGINA)
        self.assertNotIn("unsafe-eval", CSP_PAGINA)
        self.assertNotIn("unsafe-hashes", CSP_PAGINA)

    def test_csp_vale_em_toda_pagina_e_em_todo_arquivo_menos_o_sw(self):
        for caminho in ("/", "/404.html", "/js/app.mjs", "/css/app.css", "/manifest.webmanifest", "/js/v2/cripto.worker.mjs"):
            self.assertEqual(cf.cabecalhos_para(HEADERS, caminho)["content-security-policy"], CSP_PAGINA, caminho)
        sw = diretivas(cf.cabecalhos_para(HEADERS, "/sw.js")["content-security-policy"])
        self.assertEqual(sw["default-src"], "'none'")
        self.assertEqual(sw["connect-src"], "'self'", "o worker precisa de fetch() na própria origem para pré-cachear; nunca fora dela")

    def test_demais_cabecalhos_de_endurecimento(self):
        h = cf.cabecalhos_para(HEADERS, "/")
        self.assertEqual(h["referrer-policy"], "no-referrer")
        self.assertEqual(h["x-content-type-options"], "nosniff")
        self.assertEqual(h["cross-origin-opener-policy"], "same-origin")
        for recurso in ("camera=()", "microphone=()", "geolocation=()", "payment=()"):
            self.assertIn(recurso, h["permissions-policy"])

    def test_pagina_e_service_worker_sempre_revalidam_e_fontes_tem_cache_longo(self):
        for caminho in ("/", "/index.html", "/sw.js", "/manifest.webmanifest"):
            self.assertEqual(cf.cabecalhos_para(HEADERS, caminho).get("cache-control"), "no-cache", caminho)
        self.assertIn("immutable", cf.cabecalhos_para(HEADERS, "/fonts/sora.woff2")["cache-control"])
        self.assertNotIn("cache-control", cf.cabecalhos_para(HEADERS, "/js/app.mjs"),
                         "JS sem hash no nome fica na revalidação padrão: cache longo serviria código velho a quem não tem o SW")

    def test_headers_dentro_dos_limites_do_cloudflare(self):
        regras = cf.ler_headers(HEADERS)
        self.assertLessEqual(len(regras), cf.LIMITE_REGRAS_HEADERS)
        self.assertTrue(all(len(linha) <= cf.LIMITE_LINHA_HEADERS for linha in HEADERS.splitlines()))

    def test_nenhum_script_ou_estilo_inline_em_nenhuma_pagina(self):
        for pagina in PAGINAS:
            html = pagina.read_text(encoding="utf-8")
            for tag in re.findall(r"<script\b[^>]*>", html):
                if 'type="application/ld+json"' in tag:
                    continue  # bloco de dados: não executa, a CSP não o cobre
                self.assertIn("src=", tag, f"{pagina.name}: script inline {tag}")
            self.assertNotIn("<style", html, f"{pagina.name}: <style> inline")
            self.assertEqual(re.findall(r'\son\w+="', html), [], f"{pagina.name}: handler inline (onclick=...)")
            self.assertEqual(re.findall(r'\sstyle="', html), [], f"{pagina.name}: atributo style= inline")
            self.assertNotIn("javascript:", html, pagina.name)

    def test_tema_e_script_classico_sincrono_no_head_antes_da_folha(self):
        """Módulo é adiado e piscaria o tema; o clássico roda antes do primeiro quadro."""
        html = (FITRICH / "index.html").read_text(encoding="utf-8")
        head = html.split("</head>")[0]
        tema, folha = head.index('<script src="/js/tema.js"></script>'), head.index('rel="stylesheet"')
        self.assertLess(tema, folha, "tema.js tem de vir antes do CSS para não piscar")
        self.assertNotIn("defer", html.split('src="/js/tema.js"')[0].rsplit("<script", 1)[1])
        self.assertLess((FITRICH / "js/tema.js").stat().st_size, 2000, "tema.js é síncrono: tem de ser minúsculo")
        self.assertIn('<script src="/js/tema.js"></script>', (FITRICH / "404.html").read_text(encoding="utf-8"))


class NadaDeRede(unittest.TestCase):
    # Ampliado em relação ao test_fitrich_site: tudo que faz uma requisição sair do aparelho. (navigator.share
    # fica de fora: abre a folha de compartilhar do sistema por gesto da pessoa, a página não envia nada.)
    PROIBIDO = ("fetch(", "XMLHttpRequest", "sendBeacon", "new Image(", "EventSource", "WebSocket", "importScripts(",
                "<link rel=\"preconnect\"", "<link rel=\"dns-prefetch\"", "googletagmanager")

    def test_apis_de_rede_proibidas_em_todo_js_menos_o_sw(self):
        for m in MODULOS:
            if m.name == "sw.js":
                continue  # o único fetch() permitido vive no service worker, para a própria origem (teste abaixo)
            codigo = m.read_text(encoding="utf-8")
            for proibido in self.PROIBIDO:
                self.assertNotIn(proibido, codigo, f"{m.relative_to(FITRICH)}: {proibido}")
            # Nenhuma URL `https://` no código do app: tudo é local.
            self.assertEqual(re.findall(r"https://[\w./-]*", codigo), [], f"{m.relative_to(FITRICH)}: URL de terceiro")
            # import() dinâmico só com caminho relativo/absoluto da própria origem, nunca URL.
            for alvo in re.findall(r"import\(\s*([^)]*)\)", re.sub(r"(?m)^\s*//.*$|\s//\s.*$", "", codigo)):
                # (o shell resolve o dicionário da tela contra `location.origin`: sempre a própria origem)
                proprio = re.fullmatch(r'new URL\(\w+, location\.origin', alvo.strip())
                self.assertTrue(proprio or re.fullmatch(r'["\'](\./|\.\./|/)[^:]*["\']', alvo.strip()), f"{m.name}: import({alvo}) com URL")

    def test_service_worker_so_fala_com_a_propria_origem_e_nao_pula_a_espera(self):
        sw = (FITRICH / "sw.js").read_text(encoding="utf-8")
        self.assertIn("url.origin !== self.location.origin", sw)
        self.assertNotIn("https://", sw)
        self.assertNotIn("importScripts", sw)
        self.assertEqual(sw.count("skipWaiting()"), 1, "skipWaiting só dentro do message handler")
        self.assertIn('e.data === "skipWaiting"', sw)
        self.assertNotIn("indexedDB", sw)
        self.assertNotIn("localStorage", sw)

    def test_nenhum_modulo_monta_html_por_string(self):
        # A UI v2 só constrói DOM por h()/hs(): texto vira nó de texto, então descrição de extrato hostil não vira HTML.
        for m in MODULOS:
            codigo = m.read_text(encoding="utf-8")
            for proibido in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"):
                self.assertNotIn(proibido, codigo, f"{m.relative_to(FITRICH)}: {proibido}")


class PWA(unittest.TestCase):
    def test_precache_e_icones_sao_gerados_e_batem_com_a_pasta(self):
        self.assertEqual(fp.conferir(), [], "rode: python3 scripts/fitrich_plataforma.py build")
        lista = fp.lista_precache()
        self.assertIn("/", lista)
        self.assertIn("/js/app.mjs", lista)
        self.assertIn("/css/app.css", lista)
        for fora in ("/sw.js", "/_headers", "/index.html"):
            self.assertNotIn(fora, lista)
        self.assertRegex(fp.hash_precache(), r"^[0-9a-f]{12}$")
        sw = (FITRICH / "sw.js").read_text(encoding="utf-8")
        self.assertIn(f'const CACHE = "fitrich-{fp.hash_precache()}"', sw)

    def test_toda_tela_registrada_esta_no_precache_com_css_e_dicionario_para_abrir_sem_internet(self):
        telas = FITRICH / "js/v2/ui/telas"
        lista = set(fp.lista_precache())
        ids = re.findall(r'import\("\./([\w-]+)\.mjs"\)', (telas / "indice.mjs").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(ids), 12)
        for tela in ids:
            self.assertIn(f"/js/v2/ui/telas/{tela}.mjs", lista, f"tela {tela} fora do pré-cache: abriria só com internet")
            codigo = (telas / f"{tela}.mjs").read_text(encoding="utf-8")
            for ref in re.findall(r'"(/(?:css|js)/[^"]+\.(?:css|mjs))"', codigo):
                if (FITRICH / ref.lstrip("/")).exists():
                    self.assertIn(ref, lista, f"{tela} pede {ref}, que ficou fora do pré-cache")

    def test_paginas_de_diretorio_entram_no_precache_pelo_caminho_que_o_navegador_pede(self):
        lista = fp.lista_precache()
        for pedido, arquivo in (("/", "/index.html"), ("/en/", "/en/index.html"), ("/privacidade/", "/privacidade/index.html")):
            self.assertIn(pedido, lista)
            self.assertNotIn(arquivo, lista, "o navegador pede o diretório; o SW casa por esse caminho")
        self.assertFalse([c for c in lista if c.startswith("/screenshots/")], "vitrine da loja não pesa no pré-cache")

    def test_hash_do_cache_muda_quando_qualquer_arquivo_do_app_muda_e_nao_quando_so_o_sw_muda(self):
        import shutil
        import tempfile
        with tempfile.TemporaryDirectory() as t:
            copia = Path(t) / "fitrich"
            shutil.copytree(FITRICH, copia)
            base = fp.hash_precache(copia)
            (copia / "sw.js").write_text((copia / "sw.js").read_text(encoding="utf-8") + "\n// comentário", encoding="utf-8")
            self.assertEqual(fp.hash_precache(copia), base, "o worker não entra no próprio hash")
            tela = copia / "js/v2/ui/telas/aparelho.mjs"
            tela.write_text(tela.read_text(encoding="utf-8") + "\n// mudou", encoding="utf-8")
            self.assertNotEqual(fp.hash_precache(copia), base, "tela mudou e o cache continuou o mesmo: o aparelho serviria a tela velha")
            self.assertTrue(fp.conferir(copia), "sw.js desatualizado tem de ser apontado")

    def test_manifest_completo_nos_dois_idiomas_com_icones_atalhos_e_categorias(self):
        for arquivo, idioma, id_, inicio in (("manifest.webmanifest", "pt-BR", "/", "/"), ("en/manifest.webmanifest", "en", "/en/", "/en/")):
            m = json.loads((FITRICH / arquivo).read_text(encoding="utf-8"))
            self.assertEqual((m["display"], m["lang"], m["id"], m["start_url"], m["scope"]), ("standalone", idioma, id_, inicio, "/"), arquivo)
            self.assertRegex(m["theme_color"], r"^#[0-9A-Fa-f]{6}$")
            self.assertRegex(m["background_color"], r"^#[0-9A-Fa-f]{6}$")
            self.assertTrue({"finance", "health"} <= set(m["categories"]))
            usos = {(i["sizes"], i["purpose"]) for i in m["icons"]}
            self.assertTrue({("192x192", "any"), ("512x512", "any"), ("512x512", "maskable"), ("512x512", "monochrome")} <= usos, arquivo)
            for icone in m["icons"] + [i for s in m["shortcuts"] for i in s["icons"]]:
                self.assertTrue((FITRICH / icone["src"].lstrip("/")).exists(), icone["src"])
                self.assertEqual(icone["type"], "image/png")
            self.assertEqual(len(m["shortcuts"]), 2)
            for atalho in m["shortcuts"]:
                self.assertIn("#/", atalho["url"])
            for shot in m.get("screenshots", []):
                self.assertTrue((FITRICH / shot["src"].lstrip("/")).exists(), shot["src"])
                self.assertIn(shot["form_factor"], ("narrow", "wide"))
        pt = json.loads((FITRICH / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual([s["name"] for s in pt["shortcuts"]], ["Lançar gasto", "Registrar treino"])

    def test_icones_png_tem_os_tamanhos_declarados(self):
        # Largura e altura saem do cabeçalho IHDR do PNG (bytes 16 a 24): o CI roda só com a
        # biblioteca padrão, sem Pillow, e um teste que importa PIL falha lá e não aqui.
        import struct
        for nome, (tamanho, _) in fp.ICONES_PNG.items():
            dados = (FITRICH / "icons" / nome).read_bytes()
            self.assertEqual(dados[:8], b"\x89PNG\r\n\x1a\n", nome)
            self.assertEqual(struct.unpack(">II", dados[16:24]), (tamanho, tamanho), nome)

    def test_index_liga_manifest_e_apple_touch_icon(self):
        html = (FITRICH / "index.html").read_text(encoding="utf-8")
        self.assertIn('<link rel="manifest" href="/manifest.webmanifest">', html)
        self.assertIn('<link rel="manifest" href="/en/manifest.webmanifest">', (FITRICH / "en/index.html").read_text(encoding="utf-8"))
        self.assertIn('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">', html)

    def test_pwa_mjs_pede_atualizacao_sem_pular_sozinho_e_o_app_o_carrega_fora_da_carga_inicial(self):
        pwa = (FITRICH / "js/v2/plataforma/pwa.mjs").read_text(encoding="utf-8")
        self.assertIn('postMessage("skipWaiting")', pwa)
        self.assertIn("controllerchange", pwa)
        self.assertIn("reg.waiting", pwa)
        app = (FITRICH / "js/app.mjs").read_text(encoding="utf-8")
        self.assertIn('import("./v2/plataforma/shell.mjs")', app)
        self.assertNotRegex(app, r'^import .*plataforma', "plataforma entra por import dinâmico: não pesa na carga inicial")


class BackupCifrado(unittest.TestCase):
    def test_parametros_minimos_no_codigo(self):
        c = (FITRICH / "js/v2/cripto.mjs").read_text(encoding="utf-8")
        self.assertRegex(c, r"ITERACOES_MINIMAS = 600_000")
        self.assertIn("SAL_BYTES = 16", c)
        self.assertIn("IV_BYTES = 12", c)
        self.assertIn('length: 256', c)
        self.assertIn("AES-GCM", c)
        self.assertIn("worker", (FITRICH / "js/v2/cripto.worker.mjs").read_text(encoding="utf-8").lower())
        self.assertIn("NÃO PROTEGE", c)


if __name__ == "__main__":
    unittest.main()
