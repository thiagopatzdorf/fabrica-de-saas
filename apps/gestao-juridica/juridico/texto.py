"""Texto dos documentos, para a busca: PDF, DOCX/ODT, texto puro e OCR (Tesseract) quando existe.

OCR é opcional: sem `tesseract` (e `pdftoppm` para PDF escaneado) o arquivo entra mesmo assim,
com `ocr_status='indisponivel'`, e fica visível que a busca não enxerga o conteúdo dele.
"""
from __future__ import annotations

import io
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree

LIMITE_CHARS = 2_000_000
_IMAGENS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"}
_PURO = {".txt", ".md", ".csv", ".eml", ".html", ".rtf"}

_executar = subprocess.run  # trocado nos testes


def ocr_disponivel() -> bool:
    return shutil.which("tesseract") is not None


def _limpar(t: str) -> str:
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", t.replace("\x00", ""))).strip()[:LIMITE_CHARS]


LIMITE_XML = 50 * 1024 * 1024  # contra zip bomb


def _ler_zip(z: zipfile.ZipFile, nome: str) -> bytes:
    if z.getinfo(nome).file_size > LIMITE_XML:
        raise ValueError("parte do arquivo grande demais")
    return z.read(nome)


def _xml_para_texto(xml: bytes, fim_paragrafo: tuple[str, ...]) -> str:
    saida: list[str] = []
    for ev, el in ElementTree.iterparse(io.BytesIO(xml), events=("end",)):
        tag = el.tag.rsplit("}", 1)[-1]
        if tag == "t" and el.text:
            saida.append(el.text)
        elif tag in fim_paragrafo:
            saida.append("\n")
        el.clear()
    return "".join(saida)


def _ocr_imagem(caminho: Path) -> str:
    r = _executar(["tesseract", str(caminho), "stdout", "-l", "por+eng"], capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[:200])
    return r.stdout


def _ocr_pdf(caminho: Path) -> str:
    if not shutil.which("pdftoppm"):
        raise FileNotFoundError("pdftoppm")
    with tempfile.TemporaryDirectory() as tmp:
        _executar(["pdftoppm", "-r", "200", "-l", "50", "-png", str(caminho), f"{tmp}/p"], check=True, timeout=300, capture_output=True)
        return "\n".join(_ocr_imagem(p) for p in sorted(Path(tmp).glob("p*.png")))


def extrair(caminho: Path, nome: str) -> tuple[str, str]:
    """(texto, ocr_status). Nunca levanta por arquivo estranho: o upload não pode falhar por causa da busca."""
    ext = Path(nome).suffix.lower()
    try:
        if ext in _PURO:
            t = caminho.read_text("utf-8", errors="replace")
            if ext in {".html", ".rtf"}:
                t = re.sub(r"<[^>]+>", " ", t)
            return _limpar(t), "nao_aplicavel"
        if ext == ".docx":
            with zipfile.ZipFile(caminho) as z:
                return _limpar(_xml_para_texto(_ler_zip(z, "word/document.xml"), ("p", "br"))), "nao_aplicavel"
        if ext == ".odt":
            with zipfile.ZipFile(caminho) as z:
                return _limpar(_xml_para_texto(_ler_zip(z, "content.xml"), ("p", "h"))), "nao_aplicavel"
        if ext == ".pdf":
            from pypdf import PdfReader

            texto = "\n".join((pg.extract_text() or "") for pg in PdfReader(str(caminho)).pages)
            if len(texto.strip()) >= 20:
                return _limpar(texto), "nao_aplicavel"
            if not ocr_disponivel():
                return "", "indisponivel"
            return _limpar(_ocr_pdf(caminho)), "feito"
        if ext in _IMAGENS:
            if not ocr_disponivel():
                return "", "indisponivel"
            return _limpar(_ocr_imagem(caminho)), "feito"
    except FileNotFoundError:
        return "", "indisponivel"
    except Exception:  # arquivo corrompido, PDF protegido, tesseract falhou
        return "", "falhou"
    return "", "nao_aplicavel"
