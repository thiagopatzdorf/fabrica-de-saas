import csv
import io
import json
import re
import shutil
import unittest

from helpers import RAIZ, cat, gerar, item_valido, categoria_valida, raiz_verificada_e_gerada, rodar

try:
    import jsonschema
except ImportError:
    jsonschema = None

EXCLUIDOS = ["EvilCorp", "Fonte Visível", "Fantasma", "ghost/gone", "Arquivado", "old/archived",
             "Sem Licença", "noassert", "BUSL"]
TODOS = ["README.md", "catalogo.json", "catalogo.csv", "llms.txt", "llms-full.txt", "docs/estatisticas.md",
         "schema/saas.schema.json", "catalogo/crm-vendas.md", "catalogo/gestao-de-projetos.md"]


class Gerado(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = raiz_verificada_e_gerada()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.d)

    def ler(self, rel):
        return (self.d / rel).read_text(encoding="utf-8")

    def test_todos_os_arquivos_sao_gerados(self):
        for rel in TODOS:
            self.assertTrue((self.d / rel).is_file(), rel)

    def test_geracao_e_deterministica_rodar_duas_vezes_da_os_mesmos_bytes(self):
        antes = {r: (self.d / r).read_bytes() for r in TODOS}
        self.assertEqual(rodar(gerar, "--raiz", str(self.d))[0], 0)
        self.assertEqual(antes, {r: (self.d / r).read_bytes() for r in TODOS})

    def test_conferir_passa_quando_esta_em_dia(self):
        codigo, out, _ = rodar(gerar, "--raiz", str(self.d), "--conferir")
        self.assertEqual(codigo, 0, out)

    def test_nenhum_excluido_aparece_em_nenhum_gerado(self):
        for rel in TODOS:
            texto = self.ler(rel)
            for nome in EXCLUIDOS:
                self.assertNotIn(nome, texto, f"{nome} vazou em {rel}")

    def test_rebaixado_aparece_marcado_como_parado(self):
        self.assertIn("(parado)", self.ler("catalogo/crm-vendas.md"))
        self.assertIn("[parado]", self.ler("llms-full.txt"))

    def test_renomeado_usa_o_nome_canonico_no_link(self):
        self.assertIn("https://github.com/makeplane/plane", self.ler("catalogo/gestao-de-projetos.md"))
        self.assertNotIn("github.com/plane/plane", self.ler("catalogo/gestao-de-projetos.md"))

    def test_readme_nao_tem_tabela_gigante_e_aponta_para_as_paginas(self):
        readme = self.ler("README.md")
        linhas_tabela = [l for l in readme.splitlines() if l.startswith("|")]
        self.assertLessEqual(len(linhas_tabela), 2 + 9 + 3)
        self.assertIn("catalogo/crm-vendas.md", readme)

    def test_contagens_do_readme_batem_com_os_dados(self):
        # erro caro: número do README divergir do catalogo.json
        dados = json.loads(self.ler("catalogo.json"))
        meta, itens = dados["meta"], dados["itens"]
        readme = self.ler("README.md")
        self.assertEqual(meta["total"], len(itens))
        self.assertEqual(meta["ativos"], sum(1 for i in itens if i["status"] == "ok"))
        self.assertEqual(meta["rebaixados"], sum(1 for i in itens if i["status"] == "rebaixado"))
        self.assertIn(f"**{meta['total']}** projetos em **{len(meta['categorias'])}** categorias", readme)
        self.assertIn(f"({meta['ativos']} ativos, {meta['rebaixados']} sem push", readme)
        linhas = len(re.findall(r"^\| \[", self.ler("catalogo/crm-vendas.md") + self.ler("catalogo/gestao-de-projetos.md"), re.M))
        self.assertEqual(linhas, meta["total"])
        for c in meta["categorias"]:
            self.assertIn(f"ativos {c['ativos']}, parados {c['rebaixados']}", readme)

    def test_numero_de_testes_do_readme_e_a_soma_do_apps_yml(self):
        apps, _ = cat.carregar_apps(self.d)
        self.assertIn(f"({sum(a['testes'] for a in apps)} no total", self.ler("README.md"))

    def test_links_relativos_do_readme_e_das_paginas_existem_ou_sao_docs_obrigatorios(self):
        docs_do_repo = {"LICENSE", "NOTICE.md", "LICENSE-POLICY.md", "CONTRIBUTING.md", "AGENTS.md"}
        for rel in ["README.md", "catalogo/crm-vendas.md", "catalogo/gestao-de-projetos.md", "docs/estatisticas.md"]:
            base = (self.d / rel).parent
            for alvo in re.findall(r"\]\(([^)#]+)(?:#[^)]*)?\)", self.ler(rel)):
                if alvo.startswith(("http://", "https://")):
                    continue
                existe = (base / alvo).resolve().exists()
                no_raiz = (base / alvo).resolve().relative_to(self.d.resolve()).as_posix() in docs_do_repo
                self.assertTrue(existe or no_raiz, f"{rel} -> {alvo}")

    def test_pipe_e_formatacao_no_texto_nao_quebram_a_tabela(self):
        for l in self.ler("catalogo/gestao-de-projetos.md").splitlines():
            if l.startswith("| [Clock"):
                self.assertEqual(len(re.findall(r"(?<!\\)\|", l)), 8)  # 7 colunas = 8 separadores
                self.assertNotIn("<b>", l)

    def test_llms_full_tem_uma_linha_por_item_com_sete_campos(self):
        itens = json.loads(self.ler("catalogo.json"))["itens"]
        linhas = [l for l in self.ler("llms-full.txt").splitlines() if " | " in l and not l.startswith(("Gerado", "Demo"))]
        self.assertEqual(len(linhas), len(itens))
        for l in linhas:
            self.assertEqual(len(l.split(" | ")), 7, l)

    def test_llms_txt_segue_o_formato_llmstxt_org(self):
        t = self.ler("llms.txt").splitlines()
        self.assertEqual(t[0], "# Fábrica de SaaS")
        self.assertTrue(t[2].startswith("> "))
        self.assertTrue(any(l.startswith("## ") for l in t))
        self.assertIn("raw.githubusercontent.com/thiagopatzdorf/fabrica-de-saas/main/catalogo.json", "\n".join(t))

    def test_csv_le_de_volta_com_as_mesmas_linhas_do_json(self):
        itens = json.loads(self.ler("catalogo.json"))["itens"]
        linhas = list(csv.DictReader(io.StringIO(self.ler("catalogo.csv"))))
        self.assertEqual([l["repo"] for l in linhas], [i["repo"] for i in itens])

    def test_csv_neutraliza_formula(self):
        self.assertEqual(gerar._csv_seguro("=1+1"), "'=1+1")
        self.assertEqual(gerar._csv_seguro("normal"), "normal")

    def test_estatisticas_somam_o_total(self):
        meta = json.loads(self.ler("catalogo.json"))["meta"]
        self.assertEqual(sum(meta["licencas"].values()), meta["total"])
        self.assertIn(f"| Projetos listados | {meta['total']} |", self.ler("docs/estatisticas.md"))

    def test_nenhum_segredo_nem_url_com_credencial_nos_gerados(self):
        padroes = [r"ghp_[A-Za-z0-9]{20,}", r"github_pat_", r"AKIA[0-9A-Z]{16}", r"BEGIN [A-Z ]*PRIVATE KEY",
                   r"https?://[^/\s:@]+:[^/\s@]+@", r"[?&](token|key|access_token)=", r"/home/\w+"]
        for rel in TODOS:
            for p in padroes:
                self.assertIsNone(re.search(p, self.ler(rel)), f"{p} em {rel}")

    @unittest.skipIf(jsonschema is None, "jsonschema não instalado")
    def test_catalogo_json_gerado_cumpre_o_esquema_json(self):
        s = json.loads(self.ler("schema/saas.schema.json"))
        for nome, arq in (("catalogo", "catalogo.json"), ("verificado", "catalogo/verificado.json")):
            jsonschema.validate(json.loads(self.ler(arq)), {"$ref": f"#/$defs/{nome}", "$defs": s["$defs"]})

    def test_esquema_json_usa_os_mesmos_limites_do_validador(self):
        s = json.loads(self.ler("schema/saas.schema.json"))["$defs"]["item_entrada"]["properties"]
        self.assertEqual(s["pt"]["maxLength"], cat.MAX_FRASE)
        self.assertEqual(s["stack"]["maxItems"], cat.MAX_STACK)


class Conferir(unittest.TestCase):
    def setUp(self):
        self.d = raiz_verificada_e_gerada()
        self.addCleanup(shutil.rmtree, self.d)

    def conferir(self):
        return rodar(gerar, "--raiz", str(self.d), "--conferir")

    def test_conferir_falha_quando_um_byte_de_um_gerado_muda(self):
        for rel in ("README.md", "catalogo.json", "catalogo/crm-vendas.md", "llms.txt", "catalogo.csv"):
            with self.subTest(rel=rel):
                p = self.d / rel
                original = p.read_bytes()
                p.write_bytes(original + b" ")
                codigo, _, err = self.conferir()
                self.assertEqual(codigo, 1)
                self.assertIn(rel, err)
                p.write_bytes(original)
                self.assertEqual(self.conferir()[0], 0)

    def test_conferir_falha_se_um_gerado_sumiu(self):
        (self.d / "llms-full.txt").unlink()
        self.assertEqual(self.conferir()[0], 1)

    def test_conferir_falha_quando_o_yaml_muda_e_o_gerado_ficou_velho(self):
        p = self.d / "catalogo" / "gestao-de-projetos.yml"
        p.write_text(p.read_text().replace("Gestão de projetos com ciclos", "Gestão com ciclos"))
        self.assertEqual(self.conferir()[0], 1)

    def test_conferir_falha_quando_o_verificado_muda(self):
        p = self.d / "catalogo" / "verificado.json"
        p.write_text(p.read_text().replace('"estrelas": 31500', '"estrelas": 31501'))
        self.assertEqual(self.conferir()[0], 1)

    def test_categoria_removida_deixa_pagina_obsoleta_que_o_gerar_apaga(self):
        (self.d / "catalogo" / "crm-vendas.yml").unlink()
        codigo, _, err = self.conferir()
        self.assertEqual(codigo, 1)
        self.assertIn("obsoleto", err)
        rodar(gerar, "--raiz", str(self.d))
        self.assertFalse((self.d / "catalogo" / "crm-vendas.md").exists())
        self.assertEqual(self.conferir()[0], 0)

    def test_item_novo_sem_verificacao_fica_pendente_e_fora_das_paginas(self):
        p = self.d / "catalogo" / "crm-vendas.yml"
        p.write_text(p.read_text() + "  - repo: novo/projeto\n    nome: Novinho\n    pt: \"Recém chegado.\"\n    en: \"Just arrived.\"\n    stack: [Go]\n")
        self.assertEqual(rodar(gerar, "--raiz", str(self.d))[0], 0)
        self.assertNotIn("Novinho", (self.d / "README.md").read_text() + (self.d / "catalogo.json").read_text())
        self.assertIn("| Aguardando verificação | 1 |", (self.d / "docs" / "estatisticas.md").read_text())

    def test_dados_invalidos_impedem_gerar(self):
        (self.d / "catalogo" / "crm-vendas.yml").write_text("categoria: crm-vendas\n")
        self.assertEqual(rodar(gerar, "--raiz", str(self.d))[0], 2)


class EscalaDoReadme(unittest.TestCase):
    def test_com_60_categorias_e_900_itens_o_readme_continua_pequeno_e_sem_tabela_grande(self):
        categorias, fatos = {}, {}
        for c in range(60):
            slug = f"cat-{c:02d}"
            itens = []
            for n in range(15):
                repo = f"dono{c}/proj{n}"
                itens.append(item_valido(repo=repo, nome=f"Projeto {c}-{n}", destaque=(n == 0 and c < 3)))
                fatos[repo] = {"canonico": repo, "spdx": "MIT", "estrelas": 100 + n, "pushed_at": "2026-10-01T00:00:00Z",
                               "arquivado": False, "status": "ok", "motivo": "", "aviso": ""}
            categorias[slug] = categoria_valida(slug, itens)
        apps = [{"pasta": f"app{i}", "nome": f"App {i}", "pt": "x", "en": "y", "stack": ["Go"], "testes": i} for i in range(9)]
        saida = gerar.gerar_tudo(categorias, apps, {"gerado_em": "2026-10-27T00:00:00Z", "repos": fatos})
        readme = saida["README.md"]
        self.assertLess(len(readme.encode()), 30_000)
        self.assertLessEqual(len([l for l in readme.splitlines() if l.startswith("|")]), 2 + 9)
        self.assertEqual(len([k for k in saida if k.startswith("catalogo/")]), 60)
        self.assertIn("**900** projetos em **60** categorias", readme)


if __name__ == "__main__":
    unittest.main()
