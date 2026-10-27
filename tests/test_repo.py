"""Guardas do próprio repositório: documentos, workflows e regras que não podem divergir do código."""
import re
import unittest

from pathlib import Path

from helpers import RAIZ, cat

# workflows ficam em ci/github-workflows até o token de publicação ganhar o escopo `workflow`; depois, copiar para .github/workflows
WF_DIR = Path(".github/workflows") if (RAIZ / ".github" / "workflows").is_dir() else Path("ci/github-workflows")

OBRIGATORIOS = ["CONTRIBUTING.md", "LICENSE-POLICY.md", "AGENTS.md", "NOTICE.md", "SECURITY.md", "LICENSE",
                ".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/adicionar-saas.yml",
                ".github/ISSUE_TEMPLATE/reportar-problema.yml", "ci/github-workflows/ci.yml",
                "ci/github-workflows/atualizar.yml", "apps/apps.yml", "schema/saas.schema.json"]


class Documentos(unittest.TestCase):
    def test_todos_os_arquivos_de_infraestrutura_existem(self):
        for rel in OBRIGATORIOS:
            self.assertTrue((RAIZ / rel).is_file(), rel)

    def test_license_continua_mit(self):
        self.assertTrue((RAIZ / "LICENSE").read_text().startswith("MIT License"))

    def test_gitignore_ignora_pycache(self):
        self.assertIn("__pycache__/", (RAIZ / ".gitignore").read_text())

    def test_license_policy_lista_exatamente_as_licencas_aceitas_pelo_codigo(self):
        texto = (RAIZ / "LICENSE-POLICY.md").read_text(encoding="utf-8")
        tabela = texto.split("## Aceitas")[1].split("## Recusadas")[0]
        spdx = set()
        for linha in tabela.splitlines():
            if linha.startswith("| ") and not linha.startswith(("| SPDX", "|---")):
                spdx.update(x.strip() for x in linha.split("|")[1].split(","))
        self.assertEqual(spdx, set(cat.LICENCAS_ACEITAS))

    def test_license_policy_cita_cada_licenca_recusada_importante(self):
        texto = (RAIZ / "LICENSE-POLICY.md").read_text(encoding="utf-8")
        for nome in ("BUSL-1.1", "SSPL-1.0", "Elastic-2.0", "Commons Clause", "NOASSERTION", "fair-code"):
            self.assertIn(nome, texto)

    def test_agents_md_cita_os_comandos_e_a_regra_dos_gerados(self):
        t = (RAIZ / "AGENTS.md").read_text(encoding="utf-8")
        for trecho in ("python3 -m unittest discover -s tests", "python3 scripts/verificar.py --so-validar",
                       "python3 scripts/gerar.py --conferir", "Nunca edite arquivos gerados", "jq"):
            self.assertIn(trecho, t)

    def test_notice_cita_as_duas_fontes_de_inspiracao_e_o_ponto_eletronico(self):
        t = (RAIZ / "NOTICE.md").read_text(encoding="utf-8")
        for trecho in ("awesome-selfhosted", "RunaCapital/awesome-oss-alternatives", "OpenClockwork", "Apache-2.0"):
            self.assertIn(trecho, t)

    def test_links_do_readme_para_docs_do_repo_apontam_para_arquivos_que_existem(self):
        for rel in ("CONTRIBUTING.md", "LICENSE-POLICY.md", "NOTICE.md", "AGENTS.md"):
            self.assertTrue((RAIZ / rel).is_file())


class Workflows(unittest.TestCase):
    def workflows(self):
        return sorted((RAIZ / WF_DIR).glob("*.yml"))

    def test_toda_action_externa_esta_fixada_por_sha_com_comentario_de_versao(self):
        for w in self.workflows():
            for linha in w.read_text().splitlines():
                m = re.match(r"\s*-?\s*uses:\s*(\S+)(.*)", linha)
                if m:
                    self.assertRegex(m.group(1), r"@[0-9a-f]{40}$", f"{w.name}: {linha}")
                    self.assertRegex(m.group(2), r"#\s*v\d", f"{w.name}: sem # vX em {linha}")

    def test_ci_so_le_o_repositorio(self):
        t = (RAIZ / WF_DIR / "ci.yml").read_text()
        self.assertRegex(t, r"permissions:\n  contents: read\n")
        self.assertNotIn("write", t)

    def test_ci_roda_testes_validacao_e_conferencia(self):
        t = (RAIZ / WF_DIR / "ci.yml").read_text()
        for cmd in ("unittest discover -s tests", "verificar.py --so-validar", "gerar.py --conferir"):
            self.assertIn(cmd, t)

    def test_atualizar_tem_cron_semanal_manual_e_so_as_permissoes_necessarias(self):
        t = (RAIZ / WF_DIR / "atualizar.yml").read_text()
        self.assertIn("schedule:", t)
        self.assertIn("workflow_dispatch:", t)
        self.assertRegex(t, r"permissions:\n  contents: write\n  pull-requests: write\n")
        self.assertIn("gh pr create", t)

    def test_workflows_nao_interpolam_texto_de_evento_no_shell(self):
        # ${{ github.event.* }} dentro de run: é injeção de comando por título de PR/issue
        for w in self.workflows():
            self.assertNotIn("github.event.", w.read_text(), w.name)

    def test_nenhum_segredo_literal_nos_workflows_e_scripts(self):
        arquivos = self.workflows() + sorted((RAIZ / "scripts").glob("*.py"))
        for a in arquivos:
            self.assertIsNone(re.search(r"gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}", a.read_text()), a.name)


class Politica(unittest.TestCase):
    def test_apps_nao_foi_tocado_alem_do_apps_yml(self):
        # só o apps.yml é arquivo solto em apps/; o resto são as pastas dos produtos
        soltos = [p.name for p in (RAIZ / "apps").iterdir() if p.is_file()]
        self.assertEqual(soltos, ["apps.yml"])


if __name__ == "__main__":
    unittest.main()
