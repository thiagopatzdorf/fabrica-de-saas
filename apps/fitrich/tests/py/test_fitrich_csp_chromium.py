"""O Fitrich v1 continua funcionando com a CSP estrita aplicada de verdade, num Chromium.

Um servidor HTTP de teste serve a pasta `fitrich/` e põe os cabeçalhos do `_headers`
como uma hospedagem estática faria (leitor em headers_estaticos.py). O roteiro fitrich_csp_chromium.mjs
(Playwright) usa o app e devolve o que viu; aqui se exige: 0 violações de CSP,
0 requisições fora da origem, lançamento gravado, gráficos, tema alternando, service
worker instalado com o pré-cache e o cripto rodando no Web Worker.

Pula (não falha) quando não há Chromium/Playwright na máquina: o CI que não tem
navegador não deve ficar vermelho por isso. Onde tem, é a prova.
"""
import http.server
import json
import os
import shutil
import subprocess
import sys
import threading
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(AQUI))
import headers_estaticos as cf  # noqa: E402

FITRICH = RAIZ / "app"
HEADERS = (FITRICH / "_headers").read_text(encoding="utf-8")
TIPOS = {".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css",
         ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
         ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json"}


class ServidorComHeaders(http.server.BaseHTTPRequestHandler):
    """Serve a pasta como uma hospedagem estática: / -> index.html, _headers nunca, 404 -> 404.html, cabeçalhos do _headers."""

    def log_message(self, *a):  # silêncio
        pass

    def do_GET(self):
        caminho = self.path.split("?")[0].split("#")[0]
        if caminho == "/index.html":
            self.send_response(307)
            self.send_header("Location", "/")
            self.end_headers()
            return
        alvo = FITRICH / caminho.lstrip("/")
        if caminho.endswith("/"):  # diretório serve o index.html dele (como o Static Assets: /, /en/, /privacidade/)
            alvo = alvo / "index.html"
        status = 200
        if caminho in cf.ARQUIVOS_DE_CONFIG or not alvo.is_file() or FITRICH not in alvo.resolve().parents:
            alvo, status = FITRICH / "404.html", 404
        corpo = alvo.read_bytes()
        self.send_response(status)
        self.send_header("Content-Type", TIPOS.get(alvo.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(corpo)))
        base = {"Cache-Control": "public, max-age=0, must-revalidate"}
        for nome, valor in cf.cabecalhos_para(HEADERS, caminho, base).items():
            self.send_header(nome, valor)
        self.end_headers()
        self.wfile.write(corpo)


def _node_path() -> str | None:
    if os.environ.get("PLAYWRIGHT_NODE_MODULES"):
        return os.environ["PLAYWRIGHT_NODE_MODULES"]
    if not shutil.which("npm"):
        return None
    try:
        raiz = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=30, check=True).stdout.strip()
    except (subprocess.SubprocessError, OSError):
        return None
    return raiz if (Path(raiz) / "playwright").exists() else None


class FitrichNoChromium(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node_path = _node_path()
        if not cls.node_path or not shutil.which("node"):
            raise unittest.SkipTest("sem Playwright global (npm root -g) ou node: defina PLAYWRIGHT_NODE_MODULES")
        cls.servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ServidorComHeaders)
        cls.base = f"http://127.0.0.1:{cls.servidor.server_address[1]}"
        threading.Thread(target=cls.servidor.serve_forever, daemon=True).start()
        env = {**os.environ, "NODE_PATH": cls.node_path}
        p = subprocess.run(["node", str(AQUI / "fitrich_csp_chromium.mjs"), cls.base], capture_output=True, text=True, timeout=180, env=env)
        if p.returncode != 0:
            if "browserType.launch" in p.stderr or "Executable doesn't exist" in p.stderr:
                raise unittest.SkipTest("Playwright sem Chromium instalado: " + p.stderr.strip().splitlines()[-1][:120])
            raise AssertionError(p.stderr[-2000:])
        cls.v = json.loads(p.stdout.strip().splitlines()[-1])

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "servidor"):
            cls.servidor.shutdown()

    def test_zero_violacoes_de_csp_e_nenhuma_requisicao_fora_da_origem(self):
        self.assertEqual(self.v["csp"], cf.cabecalhos_para(HEADERS, "/")["content-security-policy"], "a página chegou com a CSP do _headers")
        self.assertIn("connect-src 'none'", self.v["csp"])
        self.assertEqual(self.v["violacoes"], [])
        self.assertEqual(self.v["foraDaOrigem"], [])
        self.assertEqual(self.v["errosPagina"], [])
        # O único erro aceito é o 404 da navegação proposital para /nao-existe; qualquer outro
        # (Permissions-Policy desconhecida, asset faltando, exceção) reprova.
        # O Chromium às vezes avisa "A preload for ... cross-world service worker resource mismatch" na 1ª carga com
        # service worker (corrida entre o modulepreload e o SW; medido: ~1 em 3 execuções, sem relação com a CSP).
        ruido = "cross-world service worker resource mismatch"
        self.assertEqual([e for e in self.v["errosConsole"] if not (e.startswith(self.base + "/nao-existe") and "404" in e) and ruido not in e], [])

    def test_app_v2_funciona_sob_a_csp_lancar_abrir_todas_as_telas_e_tema(self):
        self.assertGreaterEqual(self.v["navs"], 12)
        self.assertEqual(self.v["lancou"], 1, "o lançamento foi gravado")
        self.assertEqual(self.v["faltando"], [], "nenhuma chave de tradução faltando")
        self.assertIn("aparelho", self.v["telas"], "a tela App e aparelho abre sob a CSP")
        self.assertTrue(all(n > 0 for n in self.v["telas"].values()), self.v["telas"])
        self.assertGreaterEqual(self.v["graficos"], 1)
        self.assertEqual((self.v["temaInicial"], self.v["temaDepois"]), ("light", "dark"), "sem preferência guardada vale o tema do sistema (claro no Chromium headless)")
        self.assertEqual(self.v["temaGuardado"], "dark")
        self.assertEqual(self.v["metaTema"].upper(), "#1A1A19", "a barra do sistema acompanha o tema escolhido")
        self.assertEqual(self.v["temaAposReload"], "dark", "tema.js síncrono no head aplica o tema guardado antes do primeiro quadro")
        self.assertEqual(self.v["status404"], 404)
        self.assertIn("não encontrada", self.v["titulo404"])

    def test_service_worker_instala_o_precache_sem_pular_a_espera(self):
        sw = self.v["sw"]
        self.assertTrue(sw["escopo"].startswith(self.base))
        self.assertEqual(len([c for c in sw["caches"] if c.startswith("fitrich-")]), 1)
        self.assertGreaterEqual(sw["guardados"], 100, "pré-cache gerado tem todos os arquivos, telas inclusas")
        self.assertFalse(sw["waiting"], "primeira instalação não deixa versão esperando")
        self.assertEqual(sw["barra"], 0, "sem versão nova, sem faixa de atualizar")

    def test_cripto_roda_no_web_worker_e_senha_errada_falha_limpa(self):
        c = self.v["cripto"]
        self.assertEqual(c.get("erroSenhaErrada"), "senha incorreta ou arquivo adulterado", c)
        self.assertLess(c["ms"], 20000)


if __name__ == "__main__":
    unittest.main()
