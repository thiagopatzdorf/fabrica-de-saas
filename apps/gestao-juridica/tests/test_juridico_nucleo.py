"""Núcleo determinístico: CNJ, CPF/CNPJ e contagem de prazos.

Os valores esperados de prazo foram contados à mão no calendário, não tirados da função.
"""
from datetime import date

import pytest

from juridico import cnj
from juridico.calendario import (calcular_prazo, dia_util, em_recesso, feriados_nacionais, pascoa,
                                 proximo_dia_util, recuar_dias_uteis)
from juridico.documentos_br import cnpj_valido, cpf_valido, formatar_documento, so_digitos


# ---------- CPF / CNPJ ----------
def test_cpf_com_digito_trocado_nao_passa():
    assert cpf_valido("529.982.247-25")
    assert not cpf_valido("529.982.247-24")


def test_cpf_de_digitos_repetidos_nao_passa_embora_o_calculo_feche():
    assert not cpf_valido("111.111.111-11")


def test_cnpj_valido_e_invalido():
    assert cnpj_valido("11.222.333/0001-81")
    assert not cnpj_valido("11.222.333/0001-82")


def test_formatar_e_so_digitos():
    assert so_digitos("529.982.247-25") == "52998224725"
    assert formatar_documento("52998224725") == "529.982.247-25"
    assert formatar_documento("11222333000181") == "11.222.333/0001-81"


# ---------- CNJ ----------
def test_cnj_gerado_valida_e_digito_trocado_reprova():
    n = cnj.gerar(1234567, 2023, 8, 26, 100)
    assert n == "1234567-" + n[8:10] + ".2023.8.26.0100"
    assert cnj.valido(n)
    errado = n[:8] + f"{(int(n[8:10]) + 1) % 100:02d}" + n[10:]
    assert not cnj.valido(errado)


def test_cnj_dv_conferido_por_conta_independente():
    # DV = 98 - (NNNNNNN AAAA J TR OOOO 00) mod 97, refeito aqui com inteiros.
    base = int(f"{1234567}{2023}{8}{26}{100:04d}00")
    esperado = 98 - base % 97
    assert cnj.interpretar(cnj.gerar(1234567, 2023, 8, 26, 100)).dv == f"{esperado:02d}"


def test_cnj_identifica_tribunal():
    assert cnj.interpretar(cnj.gerar(1, 2022, 8, 26, 1)).sigla == "TJSP"
    assert cnj.interpretar(cnj.gerar(1, 2022, 8, 21, 1)).uf == "RS"
    assert cnj.interpretar(cnj.gerar(1, 2022, 4, 4, 1)).sigla == "TRF4"
    assert cnj.interpretar(cnj.gerar(1, 2022, 5, 2, 1)).sigla == "TRT2"
    assert cnj.interpretar(cnj.gerar(1, 2022, 8, 24, 1)).ramo_nome == "Justiça Estadual"


def test_cnj_aceita_so_digitos_e_rejeita_tamanho_errado():
    n = cnj.gerar(7654321, 2021, 8, 13, 24)
    assert cnj.valido(n.replace("-", "").replace(".", ""))
    assert not cnj.valido("123")
    assert not cnj.valido(None)


def test_achar_numeros_em_publicacao_ignora_numero_com_dv_errado():
    bom = cnj.gerar(555, 2020, 8, 26, 50)
    ruim = "0000555-00.2020.8.26.0050"
    achados = cnj.achar_numeros(f"Processo {bom}. Ver também {ruim} e {bom} de novo.")
    assert [a.formatado for a in achados] == [bom]


# ---------- calendário ----------
@pytest.mark.parametrize("ano,esperado", [(2023, date(2023, 4, 9)), (2024, date(2024, 3, 31)),
                                          (2025, date(2025, 4, 20)), (2026, date(2026, 4, 5))])
def test_pascoa(ano, esperado):
    assert pascoa(ano) == esperado


def test_sexta_santa_e_feriado_e_consciencia_negra_so_desde_2024():
    assert date(2024, 3, 29) in feriados_nacionais(2024)
    assert date(2023, 11, 20) not in feriados_nacionais(2023)
    assert date(2024, 11, 20) in feriados_nacionais(2024)


def test_recesso_vai_de_20_dez_a_20_jan_inclusive():
    assert em_recesso(date(2024, 12, 20)) and em_recesso(date(2025, 1, 20))
    assert not em_recesso(date(2024, 12, 19)) and not em_recesso(date(2025, 1, 21))


def test_prazo_15_uteis_por_dje_conta_publicacao_no_util_seguinte():
    # Disponibilizado seg 04/03/2024 -> publicação ter 05/03 -> dia 1 = qua 06/03.
    r = calcular_prazo(date(2024, 3, 4), 15, evento="disponibilizacao_dje")
    assert r.publicacao == date(2024, 3, 5)
    assert r.primeiro_dia == date(2024, 3, 6)
    assert r.data_fatal == date(2024, 3, 26)


def test_disponibilizacao_na_sexta_publica_na_segunda_e_conta_da_terca():
    r = calcular_prazo(date(2024, 3, 8), 5, evento="disponibilizacao_dje")  # sex
    assert r.publicacao == date(2024, 3, 11)
    assert r.primeiro_dia == date(2024, 3, 12)
    assert r.data_fatal == date(2024, 3, 18)


def test_prazo_por_ciencia_nao_conta_o_dia_da_ciencia():
    r = calcular_prazo(date(2024, 3, 4), 5)  # seg: dias 5,6,7,8,11
    assert r.primeiro_dia == date(2024, 3, 5)
    assert r.data_fatal == date(2024, 3, 11)


def test_prazo_pula_feriado_nacional_no_meio():
    # 15/04/2024 seg, 5 úteis: 16,17,18,19, (sáb/dom), 22 -> 21/04 é domingo (Tiradentes) e não muda nada;
    # em 2025 Tiradentes cai na segunda 21/04.
    r = calcular_prazo(date(2025, 4, 17), 3)  # quinta; sexta 18 é Sexta Santa (20/04/2025 é a Páscoa)
    # dias úteis: seg 21/04 é Tiradentes (feriado) -> conta ter 22, qua 23, qui 24
    assert r.data_fatal == date(2025, 4, 24)


def test_recesso_suspende_a_contagem():
    # Disponibilizado seg 16/12/2024 -> publica ter 17 -> dia 1 = qua 18/12.
    # Conta 18 e 19/12; suspende 20/12..20/01; retoma 21/01/2025 (ter) com mais 13 dias úteis -> 06/02/2025.
    r = calcular_prazo(date(2024, 12, 16), 15, evento="disponibilizacao_dje")
    assert r.data_fatal == date(2025, 2, 6)


def test_prazo_em_dobro_para_a_fazenda():
    simples = calcular_prazo(date(2024, 3, 4), 15, evento="disponibilizacao_dje")
    dobro = calcular_prazo(date(2024, 3, 4), 15, evento="disponibilizacao_dje", dobro=True)
    assert dobro.dias_contados == 30 and dobro.data_fatal > simples.data_fatal


def test_prazo_corrido_que_vence_no_domingo_vai_para_segunda():
    # ciência seg 04/03/2024, 6 corridos -> dom 10/03 -> segunda 11/03
    r = calcular_prazo(date(2024, 3, 4), 6, contagem="corridos")
    assert r.protraido and r.data_fatal == date(2024, 3, 11)


def test_feriado_local_extra_empurra_a_data():
    sem = calcular_prazo(date(2024, 3, 4), 3)  # 5,6,7 -> qui 07/03
    com = calcular_prazo(date(2024, 3, 4), 3, extras={date(2024, 3, 6)})  # feriado municipal na qua
    assert sem.data_fatal == date(2024, 3, 7) and com.data_fatal == date(2024, 3, 8)


def test_prazo_com_zero_dias_e_contagem_invalida_sao_recusados():
    with pytest.raises(ValueError):
        calcular_prazo(date(2024, 3, 4), 0)
    with pytest.raises(ValueError):
        calcular_prazo(date(2024, 3, 4), 5, contagem="semanas")


def test_memoria_de_calculo_explica_publicacao_e_data_fatal():
    r = calcular_prazo(date(2024, 3, 4), 15, evento="disponibilizacao_dje")
    texto = "\n".join(r.memoria)
    assert "05/03/2024" in texto and "26/03/2024" in texto


def test_proximo_dia_util_e_recuar():
    assert proximo_dia_util(date(2024, 3, 9)) == date(2024, 3, 11)  # sáb -> seg
    assert dia_util(date(2024, 3, 11))
    assert recuar_dias_uteis(date(2024, 3, 11), 2) == date(2024, 3, 7)  # seg -2 úteis = qui


# ---------- regras de prazo ----------
from juridico.regras_prazo import sugerir  # noqa: E402


def test_intimacao_para_contestar_sugere_15_uteis_do_art_335():
    s = sugerir("Cite-se o réu para, querendo, apresentar contestação.")
    assert [(x.chave, x.dias, x.contagem) for x in s] == [("contestacao", 15, "uteis")]


def test_prazo_expresso_no_texto_vence_o_padrao_da_lei():
    s = sugerir("Intime-se para apresentar réplica no prazo de 05 (cinco) dias.")
    assert (s[0].chave, s[0].dias, s[0].origem) == ("replica", 5, "texto")


def test_prazo_por_extenso_e_corridos_sao_lidos():
    s = sugerir("Manifeste-se a parte sobre o laudo pericial no prazo de dez dias corridos.")
    assert (s[0].dias, s[0].contagem) == (10, "corridos")


def test_prazo_do_juizo_sem_ato_conhecido_vira_prazo_judicial_generico():
    s = sugerir("Concedo à autora o prazo de 3 dias para juntar o comprovante.")
    assert [(x.chave, x.dias) for x in s] == [("prazo_judicial", 3)]


def test_publicacao_sem_prazo_nao_sugere_nada():
    assert sugerir("Juntada de petição. Conclusos para despacho.") == []


def test_embargos_de_declaracao_sao_5_dias_e_apelacao_15():
    assert sugerir("opostos embargos de declaração")[0].dias == 5
    assert sugerir("Sentença publicada; cabe apelação")[0].dias == 15


def test_acento_e_caixa_nao_mudam_o_resultado():
    assert sugerir("CONTESTAÇÃO")[0].chave == sugerir("contestacao")[0].chave


def test_embargos_em_execucao_fiscal_sao_30_dias_da_lef_e_nao_15_do_cpc():
    texto = "Cite-se a executada para, querendo, apresentar embargos à execução."
    assert [(s.dias, s.base_legal) for s in sugerir(texto)] == [(15, "CPC art. 915")]
    fiscal = sugerir(texto, contexto="Execução Fiscal — ICMS")
    assert [(s.chave, s.dias, s.base_legal) for s in fiscal] == [("embargos_execucao_fiscal", 30, "Lei 6.830/1980 (LEF) art. 16")]
