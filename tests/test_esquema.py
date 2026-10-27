import json
import shutil
import unittest

from helpers import RAIZ, categoria_valida, cat, copia_fixture, item_valido, rodar, verificar
import yaml

try:
    import jsonschema
except ImportError:  # o CI só instala pyyaml; o teste cruzado roda onde houver jsonschema
    jsonschema = None


def erros_do_item(**m):
    return cat.validar_item(item_valido(**m), "t")


class EsquemaItem(unittest.TestCase):
    def test_item_minimo_valido_passa(self):
        self.assertEqual(erros_do_item(), [])

    def test_item_completo_valido_passa(self):
        self.assertEqual(erros_do_item(site="https://x.com", open_core=True, nota="curta", destaque=True), [])

    def test_campo_obrigatorio_ausente_e_recusado(self):
        for campo in ("repo", "nome", "pt", "en", "stack"):
            with self.subTest(campo=campo):
                self.assertTrue(any(campo in e for e in erros_do_item(**{campo: None})))

    def test_campo_desconhecido_e_recusado_para_pegar_typo(self):
        self.assertTrue(any("desconhecido" in e for e in erros_do_item(licenca="MIT")))

    def test_licenca_nao_pode_morar_no_yaml(self):
        # fatos vêm só da API: se alguém digitar licença/estrelas no YAML, o esquema recusa
        for fato in ("licenca", "estrelas", "spdx", "arquivado"):
            self.assertTrue(erros_do_item(**{fato: "x"}))

    def test_frase_com_141_caracteres_e_recusada_e_com_140_passa(self):
        self.assertEqual(erros_do_item(pt="a" * 140, en="b" * 140), [])
        self.assertTrue(any("141" in e for e in erros_do_item(pt="a" * 141)))
        self.assertTrue(any("141" in e for e in erros_do_item(en="a" * 141)))

    def test_stack_com_cinco_itens_e_recusada(self):
        self.assertEqual(erros_do_item(stack=list("abcd")), [])
        self.assertTrue(any("stack" in e for e in erros_do_item(stack=list("abcde"))))
        self.assertTrue(any("stack" in e for e in erros_do_item(stack=[])))

    def test_url_em_pt_en_nome_e_nota_e_recusada(self):
        for campo in ("pt", "en", "nome", "nota"):
            for lixo in ("veja https://x.com", "www.x.com", "http://a.b"):
                with self.subTest(campo=campo, lixo=lixo):
                    self.assertTrue(any("URL" in e for e in erros_do_item(**{campo: lixo})))

    def test_repo_mal_formado_e_recusado(self):
        for ruim in ("semdono", "a/b/c", "https://github.com/a/b", "a b/c", "a/b\"c", ""):
            with self.subTest(repo=ruim):
                self.assertTrue(erros_do_item(repo=ruim), ruim)

    def test_tipos_errados_sao_recusados(self):
        self.assertTrue(erros_do_item(open_core="sim"))
        self.assertTrue(erros_do_item(destaque=1))
        self.assertTrue(erros_do_item(pt=123))
        self.assertTrue(erros_do_item(site="ftp://x"))
        self.assertTrue(erros_do_item(pt="duas\nlinhas"))

    def test_item_que_nao_e_mapa_e_recusado(self):
        self.assertTrue(cat.validar_item("texto", "t"))


class EsquemaCategoria(unittest.TestCase):
    def test_categoria_valida_passa(self):
        self.assertEqual(cat.validar_categoria(categoria_valida("demo"), "catalogo/demo.yml"), [])

    def test_slug_diferente_do_nome_do_arquivo_e_recusado(self):
        self.assertTrue(cat.validar_categoria(categoria_valida("outro"), "catalogo/demo.yml"))

    def test_slug_invalido_e_lista_vazia_sao_recusados(self):
        self.assertTrue(cat.validar_categoria(categoria_valida("Demo Ruim"), "catalogo/Demo Ruim.yml"))
        d = categoria_valida("demo"); d["itens"] = []
        self.assertTrue(cat.validar_categoria(d, "catalogo/demo.yml"))

    def test_duplicata_de_repo_ignora_maiusculas_e_cruza_arquivos(self):
        a = categoria_valida("a", [item_valido(repo="Dono/Nome")])
        b = categoria_valida("b", [item_valido(repo="dono/nome")])
        erros = cat.validar_catalogo({"a": a, "b": b})
        self.assertEqual(len(erros), 1)
        self.assertIn("duplicado", erros[0])

    def test_duplicata_dentro_do_mesmo_arquivo_tambem_e_pega(self):
        a = categoria_valida("a", [item_valido(repo="x/y"), item_valido(repo="X/Y")])
        self.assertEqual(len(cat.validar_catalogo({"a": a})), 1)

    def test_yaml_com_chave_repetida_e_recusado(self):
        with self.assertRaises(yaml.YAMLError):
            yaml.load("a: 1\na: 2\n", Loader=cat._Loader)

    def test_apps_yml_real_lista_exatamente_as_pastas_de_apps(self):
        apps, erros = cat.carregar_apps(RAIZ)
        self.assertEqual(erros, [])
        self.assertEqual(len(apps), len([p for p in (RAIZ / "apps").iterdir() if p.is_dir()]))


class SoValidarCLI(unittest.TestCase):
    def test_so_validar_aceita_a_fixture_sem_rede_nem_token(self):
        d = copia_fixture()
        try:
            codigo, out, _ = rodar(verificar, "--raiz", str(d), "--so-validar", ambiente={})
            self.assertEqual(codigo, 0)
            self.assertIn("2 categorias", out)
            self.assertFalse((d / "catalogo" / "verificado.json").exists())
        finally:
            shutil.rmtree(d)

    def test_so_validar_falha_com_exit_2_e_lista_todos_os_erros(self):
        d = copia_fixture()
        try:
            p = d / "catalogo" / "crm-vendas.yml"
            p.write_text(p.read_text().replace('stack: [Ruby]', 'stack: [a, b, c, d, e]').replace("twentyhq/twenty", "GHOST/gone"))
            codigo, _, err = rodar(verificar, "--raiz", str(d), "--so-validar")
            self.assertEqual(codigo, 2)
            self.assertIn("stack", err)
            self.assertIn("duplicado", err)
        finally:
            shutil.rmtree(d)


@unittest.skipIf(jsonschema is None, "jsonschema não instalado")
class EsquemaJSONConcordaComOValidadorPython(unittest.TestCase):
    def schema(self, nome):
        s = json.loads((RAIZ / "schema" / "saas.schema.json").read_text(encoding="utf-8")) if (RAIZ / "schema" / "saas.schema.json").exists() else json.loads(__import__("gerar").esquema())
        return {"$ref": f"#/$defs/{nome}", "$defs": s["$defs"], "$schema": s["$schema"]}

    def test_yaml_valido_passa_no_json_schema_e_o_invalido_cai(self):
        bom = categoria_valida("demo")
        jsonschema.validate(bom, self.schema("categoria"))
        for ruim in (categoria_valida("demo", [item_valido(pt="a" * 141)]),
                     categoria_valida("demo", [item_valido(stack=list("abcde"))]),
                     categoria_valida("demo", [item_valido(pt="veja https://x.com")]),
                     categoria_valida("demo", [item_valido(repo="semdono")])):
            with self.assertRaises(jsonschema.ValidationError):
                jsonschema.validate(ruim, self.schema("categoria"))
