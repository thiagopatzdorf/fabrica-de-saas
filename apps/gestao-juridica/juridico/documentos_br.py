"""CPF e CNPJ: normalização e dígitos verificadores.

Busca por documento compara só dígitos; sem isso "123.456.789-09" e "12345678909"
viram clientes duplicados.
"""
from __future__ import annotations

import re


def so_digitos(valor: str | None) -> str:
    return re.sub(r"\D", "", valor or "")


def cpf_valido(valor: str | None) -> bool:
    d = so_digitos(valor)
    if len(d) != 11 or d == d[0] * 11:
        return False
    for tam in (9, 10):
        soma = sum(int(d[i]) * (tam + 1 - i) for i in range(tam))
        dv = (soma * 10 % 11) % 10
        if dv != int(d[tam]):
            return False
    return True


def cnpj_valido(valor: str | None) -> bool:
    d = so_digitos(valor)
    if len(d) != 14 or d == d[0] * 14:
        return False
    pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    for tam in (12, 13):
        soma = sum(int(d[i]) * pesos[len(pesos) - tam + i] for i in range(tam))
        dv = 0 if soma % 11 < 2 else 11 - soma % 11
        if dv != int(d[tam]):
            return False
    return True


def documento_valido(valor: str | None) -> bool:
    d = so_digitos(valor)
    return cpf_valido(d) if len(d) == 11 else cnpj_valido(d) if len(d) == 14 else False


def formatar_documento(valor: str | None) -> str:
    d = so_digitos(valor)
    if len(d) == 11:
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return valor or ""
