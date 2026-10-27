"""Número único de processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO.

DD é dígito verificador módulo 97. Validar aqui evita o erro mais comum de cadastro
(um dígito trocado) que depois faz a captura automática nunca achar o processo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CNJ_FORMATADO = re.compile(r"\b(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})\b")

_UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
        "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"]  # TR 01..27, ordem alfabética do nome do estado

RAMOS = {
    "1": "Supremo Tribunal Federal", "2": "Conselho Nacional de Justiça", "3": "Superior Tribunal de Justiça",
    "4": "Justiça Federal", "5": "Justiça do Trabalho", "6": "Justiça Eleitoral",
    "7": "Justiça Militar da União", "8": "Justiça Estadual", "9": "Justiça Militar Estadual",
}


@dataclass(frozen=True)
class NumeroCNJ:
    sequencial: str
    dv: str
    ano: str
    ramo: str
    tr: str
    origem: str

    @property
    def digitos(self) -> str:
        return f"{self.sequencial}{self.dv}{self.ano}{self.ramo}{self.tr}{self.origem}"

    @property
    def formatado(self) -> str:
        return f"{self.sequencial}-{self.dv}.{self.ano}.{self.ramo}.{self.tr}.{self.origem}"

    @property
    def codigo_tribunal(self) -> str:
        return f"{self.ramo}.{self.tr}"

    @property
    def uf(self) -> str | None:
        if self.ramo in {"8", "6", "9"} and self.tr.isdigit() and 1 <= int(self.tr) <= 27:
            return _UFS[int(self.tr) - 1]
        return None

    @property
    def sigla(self) -> str:
        n = int(self.tr) if self.tr.isdigit() else 0
        if self.ramo == "1":
            return "STF"
        if self.ramo == "2":
            return "CNJ"
        if self.ramo == "3":
            return "STJ"
        if self.ramo == "4":
            return f"TRF{n}"
        if self.ramo == "5":
            return "TST" if n == 0 else f"TRT{n}"
        if self.ramo == "6":
            return f"TRE-{self.uf}" if self.uf else "TSE"
        if self.ramo == "7":
            return "STM"
        if self.ramo == "8":
            return f"TJ{self.uf}" if self.uf else "TJ"
        return f"TJM-{self.uf}" if self.uf else "TJM"

    @property
    def ramo_nome(self) -> str:
        return RAMOS.get(self.ramo, "Desconhecido")


def calcular_dv(sequencial: str, ano: str, ramo: str, tr: str, origem: str) -> str:
    resto = int(f"{sequencial}{ano}{ramo}{tr}{origem}00") % 97
    return f"{98 - resto:02d}"


def interpretar(valor: str | None) -> NumeroCNJ | None:
    """Devolve o número se tiver 20 dígitos e o DV fechar; None caso contrário."""
    d = re.sub(r"\D", "", valor or "")
    if len(d) != 20:
        return None
    n = NumeroCNJ(d[:7], d[7:9], d[9:13], d[13], d[14:16], d[16:20])
    if n.ramo == "0" or calcular_dv(n.sequencial, n.ano, n.ramo, n.tr, n.origem) != n.dv:
        return None
    return n


def valido(valor: str | None) -> bool:
    return interpretar(valor) is not None


def achar_numeros(texto: str) -> list[NumeroCNJ]:
    """Números CNJ válidos que aparecem num texto (publicação, e-mail), sem repetir."""
    vistos: dict[str, NumeroCNJ] = {}
    candidatos = [m.group(0) for m in CNJ_FORMATADO.finditer(texto or "")]
    candidatos += re.findall(r"(?<![\d.\-/])\d{20}(?![\d.\-/])", texto or "")
    for c in candidatos:
        n = interpretar(c)
        if n and n.digitos not in vistos:
            vistos[n.digitos] = n
    return list(vistos.values())


def gerar(sequencial: int, ano: int, ramo: int, tr: int, origem: int) -> str:
    """Monta um número com DV correto (usado em testes e dados de demonstração)."""
    s, a, j, t, o = f"{sequencial:07d}", f"{ano:04d}", str(ramo), f"{tr:02d}", f"{origem:04d}"
    return NumeroCNJ(s, calcular_dv(s, a, j, t, o), a, j, t, o).formatado
