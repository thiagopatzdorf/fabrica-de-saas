import unittest
from datetime import datetime, timezone

from helpers import cat

AGORA = datetime(2026, 10, 27, tzinfo=timezone.utc)


def no(spdx="MIT", pushed="2026-10-01T00:00:00Z", arquivado=False, privado=False, nome="a/b", estrelas=5):
    return {"nameWithOwner": nome, "isArchived": arquivado, "isPrivate": privado, "pushedAt": pushed,
            "stargazerCount": estrelas, "licenseInfo": None if spdx is None else {"spdxId": spdx}}


class Licencas(unittest.TestCase):
    ACEITAS = ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0",
               "MPL-2.0", "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0", "LGPL-3.0-only",
               "LGPL-3.0-or-later", "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0", "GPL-3.0-only",
               "GPL-3.0-or-later", "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later", "EUPL-1.2", "EPL-2.0", "Zlib"]

    def test_lista_aceita_e_exatamente_a_combinada(self):
        self.assertEqual(sorted(cat.LICENCAS_ACEITAS), sorted(self.ACEITAS))

    def test_cada_licenca_aceita_vira_ok(self):
        for spdx in self.ACEITAS:
            with self.subTest(spdx=spdx):
                self.assertIsNone(cat.avaliar_licenca(spdx))
                self.assertEqual(cat.avaliar_repo("a/b", no(spdx), AGORA)["status"], "ok")

    def test_cada_licenca_rejeitada_vira_excluido_com_motivo(self):
        rejeitadas = ["NOASSERTION", "Other", "", None, "BUSL-1.1", "SSPL-1.0", "Elastic-2.0", "Commons-Clause",
                      "Commons Clause", "CC-BY-NC-4.0", "Proprietary", "WTFPL-inventada", "GPL-3.0+", "mit"]
        for spdx in rejeitadas:
            with self.subTest(spdx=spdx):
                r = cat.avaliar_repo("a/b", no(spdx), AGORA)
                self.assertEqual(r["status"], "excluido")
                self.assertTrue(r["motivo"])

    def test_noassertion_nunca_e_aceita_por_engano(self):
        # erro que mais custa: GitHub devolve NOASSERTION quando a licença é custom ou ambígua
        self.assertIsNotNone(cat.avaliar_licenca("NOASSERTION"))
        r = cat.avaliar_repo("a/b", no("NOASSERTION"), AGORA)
        self.assertEqual(r["status"], "excluido")
        self.assertIn("não identificada", r["motivo"])

    def test_sem_licenca_alguma_tambem_e_excluido(self):
        r = cat.avaliar_repo("a/b", no(None), AGORA)
        self.assertEqual(r["status"], "excluido")

    def test_motivo_de_licenca_source_available_explica_por_que(self):
        for spdx in ("BUSL-1.1", "SSPL-1.0", "Elastic-2.0"):
            self.assertIn("não é open source", cat.avaliar_licenca(spdx))


class Status(unittest.TestCase):
    def test_arquivado_e_excluido_mesmo_com_licenca_boa_e_push_recente(self):
        r = cat.avaliar_repo("a/b", no(arquivado=True), AGORA)
        self.assertEqual(r["status"], "excluido")
        self.assertTrue(r["arquivado"])
        self.assertIn("arquivado", r["motivo"])

    def test_inexistente_ou_privado_e_excluido(self):
        self.assertEqual(cat.avaliar_repo("a/b", None, AGORA)["status"], "excluido")
        self.assertEqual(cat.avaliar_repo("a/b", no(privado=True), AGORA)["status"], "excluido")

    def test_push_ha_17_meses_e_ok_e_ha_19_meses_e_rebaixado(self):
        self.assertEqual(cat.avaliar_repo("a/b", no(pushed="2025-05-27T00:00:00Z"), AGORA)["status"], "ok")
        self.assertEqual(cat.avaliar_repo("a/b", no(pushed="2025-03-27T00:00:00Z"), AGORA)["status"], "rebaixado")

    def test_fronteira_de_18_meses_exata(self):
        # 18 meses antes de 2026-10-27 é 2025-04-27: no dia exato ainda é ok, um segundo antes é rebaixado
        self.assertEqual(cat.avaliar_repo("a/b", no(pushed="2025-04-27T00:00:00Z"), AGORA)["status"], "ok")
        self.assertEqual(cat.avaliar_repo("a/b", no(pushed="2025-04-26T23:59:59Z"), AGORA)["status"], "rebaixado")

    def test_subtrair_meses_em_fim_de_mes_nao_quebra(self):
        d = datetime(2026, 8, 31, tzinfo=timezone.utc)
        self.assertEqual(cat.subtrair_meses(d, 6).strftime("%Y-%m-%d"), "2026-02-28")

    def test_arquivado_com_push_antigo_continua_excluido_nao_rebaixado(self):
        self.assertEqual(cat.avaliar_repo("a/b", no(arquivado=True, pushed="2020-01-01T00:00:00Z"), AGORA)["status"], "excluido")

    def test_repo_sem_push_nenhum_nao_vira_ok(self):
        self.assertEqual(cat.avaliar_repo("a/b", no(pushed=None), AGORA)["status"], "excluido")

    def test_renomeado_registra_canonico_e_aviso_sem_excluir(self):
        r = cat.avaliar_repo("antigo/nome", no(nome="novo/nome"), AGORA)
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["canonico"], "novo/nome")
        self.assertIn("renomeado", r["aviso"])

    def test_so_diferenca_de_maiuscula_nao_e_renomeio(self):
        r = cat.avaliar_repo("twentyhq/twenty", no(nome="twentyhq/Twenty"), AGORA)
        self.assertEqual(r["aviso"], "")
        self.assertEqual(r["canonico"], "twentyhq/Twenty")

    def test_estrelas_e_push_sao_copiados_da_api(self):
        r = cat.avaliar_repo("a/b", no(estrelas=1234, pushed="2026-10-20T10:00:00Z"), AGORA)
        self.assertEqual((r["estrelas"], r["pushed_at"], r["spdx"]), (1234, "2026-10-20T10:00:00Z", "MIT"))


if __name__ == "__main__":
    unittest.main()
