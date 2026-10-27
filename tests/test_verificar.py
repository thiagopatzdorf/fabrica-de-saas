import contextlib
import io
import json
import shutil
import unittest
from datetime import datetime, timezone

from helpers import API_FIXTURE, cat, copia_fixture, rodar, verificar

AGORA = datetime(2026, 10, 27, tzinfo=timezone.utc)
TOKEN = "ghp_SENTINELA" + "0123456789abcdef"  # valor de teste, montado em duas partes (gitleaks)


def resposta(corpo, status=200, cab=None):
    return status, cab or {}, json.dumps(corpo).encode()


def node(nome="a/b", spdx="MIT"):
    return {"nameWithOwner": nome, "isArchived": False, "isPrivate": False, "pushedAt": "2026-10-01T00:00:00Z",
            "stargazerCount": 1, "licenseInfo": {"spdxId": spdx}}


class Fixture(unittest.TestCase):
    def setUp(self):
        self.d = copia_fixture()
        self.addCleanup(shutil.rmtree, self.d)

    def rodar(self, *extra):
        return rodar(verificar, "--raiz", str(self.d), "--fixture", str(API_FIXTURE), *extra, ambiente={})

    def lido(self):
        return json.loads((self.d / "catalogo" / "verificado.json").read_text(encoding="utf-8"))

    def test_grava_status_corretos_para_cada_caso_da_fixture(self):
        self.assertEqual(self.rodar()[0], 0)
        r = self.lido()["repos"]
        esperado = {"twentyhq/twenty": "ok", "acme/crmoss": "rebaixado", "evilcorp/bsl": "excluido",
                    "ghost/gone": "excluido", "plane/plane": "ok", "openclock/clockwork": "ok",
                    "old/archived": "excluido", "noassert/repo": "excluido"}
        self.assertEqual({k: v["status"] for k, v in r.items()}, esperado)
        self.assertEqual(r["plane/plane"]["canonico"], "makeplane/plane")
        self.assertIn("renomeado", r["plane/plane"]["aviso"])
        self.assertIn("NOASSERTION", r["noassert/repo"]["motivo"])

    def test_saida_e_deterministica_mesmos_bytes_em_duas_rodadas(self):
        self.rodar()
        a = (self.d / "catalogo" / "verificado.json").read_bytes()
        self.rodar()
        self.assertEqual(a, (self.d / "catalogo" / "verificado.json").read_bytes())

    def test_chaves_ordenadas_e_formato_do_contrato(self):
        self.rodar()
        dados = self.lido()
        self.assertEqual(list(dados["repos"]), sorted(dados["repos"]))
        self.assertEqual(set(dados), {"gerado_em", "repos"})
        for v in dados["repos"].values():
            self.assertTrue({"canonico", "spdx", "estrelas", "pushed_at", "arquivado", "status", "motivo"} <= set(v))

    def test_gerado_em_nao_muda_quando_nada_mudou(self):
        self.rodar("--agora", "2026-10-27T00:00:00Z")
        self.rodar("--agora", "2026-11-03T00:00:00Z")
        # com a data nova o "rebaixado" não muda de status aqui, então nada mudou e o PR semanal não nasce
        self.assertEqual(self.lido()["gerado_em"], "2026-10-27T00:00:00Z")

    def test_sem_gravar_nao_escreve_e_estrito_falha_com_excluidos(self):
        codigo, out, _ = self.rodar("--sem-gravar", "--estrito")
        self.assertEqual(codigo, 1)
        self.assertIn("EXCLUÍDO", out)
        self.assertFalse((self.d / "catalogo" / "verificado.json").exists())

    def test_estrito_nao_trava_por_exclusao_que_ja_estava_registrada(self):
        self.rodar()  # grava: 4 excluídos ficam registrados no verificado.json
        codigo, _, _ = self.rodar("--sem-gravar", "--estrito")
        self.assertEqual(codigo, 0)

    def test_estrito_falha_para_repo_novo_ruim_mesmo_com_o_resto_registrado(self):
        self.rodar()
        p = self.d / "catalogo" / "verificado.json"
        dados = json.loads(p.read_text())
        dados["repos"].pop("noassert/repo")  # como se o PR tivesse acabado de adicioná-lo
        p.write_text(json.dumps(dados))
        codigo, _, err = self.rodar("--sem-gravar", "--estrito")
        self.assertEqual(codigo, 1)
        self.assertIn("noassert/repo", err)

    def test_fixture_sem_resposta_para_um_repo_falha_alto(self):
        p = self.d / "api.json"
        dados = json.loads(API_FIXTURE.read_text())
        dados.pop("acme/crmoss")
        p.write_text(json.dumps(dados))
        codigo, _, err = rodar(verificar, "--raiz", str(self.d), "--fixture", str(p), ambiente={})
        self.assertEqual(codigo, 2)
        self.assertIn("acme/crmoss", err)

    def test_catalogo_invalido_nao_chega_a_consultar_a_api(self):
        (self.d / "catalogo" / "crm-vendas.yml").write_text("categoria: crm-vendas\n")
        codigo, _, err = self.rodar()
        self.assertEqual(codigo, 2)
        self.assertIn("erro(s) no catálogo", err)


class SemToken(unittest.TestCase):
    def test_sem_token_falha_com_mensagem_clara_e_sem_rede(self):
        d = copia_fixture()
        try:
            codigo, _, err = rodar(verificar, "--raiz", str(d), ambiente={})
            self.assertEqual(codigo, 2)
            self.assertIn("GITHUB_TOKEN", err)
        finally:
            shutil.rmtree(d)


class ClienteGraphQL(unittest.TestCase):
    def setUp(self):  # o cliente avisa as esperas no stderr; nos testes isso é só ruído
        self._err = contextlib.redirect_stderr(io.StringIO())
        self._err.__enter__()
        self.addCleanup(self._err.__exit__, None, None, None)

    def cliente(self, respostas, esperas=None):
        chamadas = []

        def transporte(url, corpo, cab):
            chamadas.append((url, corpo, cab))
            r = respostas.pop(0)
            return r(corpo) if callable(r) else r

        c = verificar.ClienteGitHub(TOKEN, transporte=transporte, dormir=lambda s: None, agora=lambda: 1000.0)
        return c, chamadas

    def test_consulta_usa_um_alias_por_repo_e_um_pedido_so_por_lote(self):
        c, chamadas = self.cliente([resposta({"data": {"r0": node("a/b"), "r1": node("c/d")}})])
        out = c.buscar(["a/b", "C/d"])
        self.assertEqual(len(chamadas), 1)
        q = json.loads(chamadas[0][1])["query"]
        self.assertIn('r0: repository(owner: "a", name: "b")', q)
        self.assertIn('r1: repository(owner: "C", name: "d")', q)
        self.assertEqual(set(out), {"a/b", "c/d"})

    def test_mais_de_40_repos_viram_varios_lotes_de_ate_40(self):
        repos = [f"o/r{i}" for i in range(85)]

        def responder(corpo):
            n = json.loads(corpo)["query"].count("repository(")
            return resposta({"data": {f"r{i}": node(f"o/x{i}") for i in range(n)}})

        c, chamadas = self.cliente([responder, responder, responder])
        out = c.buscar(repos)
        self.assertEqual([json.loads(x[1])["query"].count("repository(") for x in chamadas], [40, 40, 5])
        self.assertEqual(len(out), 85)

    def test_nao_encontrado_vira_none_sem_derrubar_o_lote(self):
        c, _ = self.cliente([resposta({"data": {"r0": None, "r1": node("c/d")},
                                       "errors": [{"type": "NOT_FOUND", "path": ["r0"], "message": "x"}]})])
        out = c.buscar(["a/b", "c/d"])
        self.assertIsNone(out["a/b"])
        self.assertIsNotNone(out["c/d"])

    def test_outro_erro_do_graphql_aborta_em_vez_de_excluir_em_silencio(self):
        c, _ = self.cliente([resposta({"data": {"r0": None}, "errors": [{"type": "FORBIDDEN", "path": ["r0"], "message": "SAML"}]})])
        with self.assertRaises(verificar.ErroVerificacao):
            c.buscar(["a/b"])

    def test_rate_limit_espera_e_tenta_de_novo(self):
        esperas = []
        c, chamadas = self.cliente([
            (403, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": "1030"}, b'{"message":"API rate limit exceeded"}'),
            resposta({"data": {"r0": node()}})])
        c._dormir = esperas.append
        out = c.buscar(["a/b"])
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(esperas, [32.0])  # reset(1030) - agora(1000) + 2
        self.assertIsNotNone(out["a/b"])

    def test_rate_limit_secundario_respeita_retry_after(self):
        esperas = []
        c, _ = self.cliente([(429, {"retry-after": "7"}, b"{}"), resposta({"data": {"r0": node()}})])
        c._dormir = esperas.append
        c.buscar(["a/b"])
        self.assertEqual(esperas, [8.0])

    def test_rate_limit_dentro_do_graphql_tambem_espera(self):
        c, chamadas = self.cliente([
            resposta({"errors": [{"type": "RATE_LIMITED", "message": "x"}], "data": None}),
            resposta({"data": {"r0": node()}})])
        c.buscar(["a/b"])
        self.assertEqual(len(chamadas), 2)

    def test_erro_502_divide_o_lote_ao_meio(self):
        ok2 = lambda corpo: resposta({"data": {"r0": node("a/b")}})  # noqa: E731
        c, chamadas = self.cliente([(502, {}, b"bad"), (502, {}, b"bad"), ok2, ok2])
        out = c.buscar(["a/b", "c/d"])
        self.assertEqual(len(out), 2)
        self.assertEqual(len(chamadas), 4)

    def test_desiste_depois_de_cinco_tentativas_com_mensagem(self):
        c, _ = self.cliente([(403, {"retry-after": "1"}, b"rate limit")] * 5)
        with self.assertRaises(verificar.ErroVerificacao):
            c.buscar(["a/b"])

    def test_token_invalido_da_erro_claro_sem_imprimir_o_token(self):
        c, _ = self.cliente([(401, {}, f"Bad credentials {TOKEN}".encode())])
        with self.assertRaises(verificar.ErroVerificacao) as cm:
            c.buscar(["a/b"])
        self.assertNotIn(TOKEN, str(cm.exception))

    def test_token_vai_so_no_cabecalho_e_nunca_na_saida_do_programa(self):
        d = copia_fixture()
        try:
            api = json.loads(API_FIXTURE.read_text())

            def transporte(url, corpo, cab):
                self.assertEqual(cab["Authorization"], f"bearer {TOKEN}")
                self.assertNotIn(TOKEN.encode(), corpo)
                q = json.loads(corpo)["query"]
                repos = [p.split('owner: "')[1].split('"')[0] + "/" + p.split('name: "')[1].split('"')[0]
                         for p in q.split("repository(")[1:]]
                return resposta({"data": {f"r{i}": api[r.lower()] for i, r in enumerate(repos)}, "errors": [
                    {"type": "NOT_FOUND", "path": [f"r{i}"], "message": "x"} for i, r in enumerate(repos) if api[r.lower()] is None]})

            cliente = verificar.ClienteGitHub(TOKEN, transporte=transporte, dormir=lambda s: None)
            codigo, out, err = rodar(verificar, "--raiz", str(d), "--agora", "2026-10-27T00:00:00Z",
                                     cliente=cliente, ambiente={"GITHUB_TOKEN": TOKEN})
            self.assertEqual(codigo, 0, err)
            self.assertNotIn(TOKEN, out + err)
            self.assertNotIn(TOKEN, (d / "catalogo" / "verificado.json").read_text())
        finally:
            shutil.rmtree(d)


if __name__ == "__main__":
    unittest.main()
