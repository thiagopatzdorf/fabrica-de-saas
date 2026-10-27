"""Plataforma do Fitrich (app/): o que é gerado, não digitado.

    python scripts/fitrich_plataforma.py build       # ícones PNG + lista de pré-cache do sw.js
    python scripts/fitrich_plataforma.py conferir    # falha se a pasta diverge do que build geraria

Duas coisas saem daqui, e nenhuma delas pode ser escrita à mão:

1. **Ícones da PWA** (`icons/`): 192, 512, 512 maskable e apple-touch-icon 180,
   desenhados com Pillow a partir da MESMA geometria do `favicon.svg` (quadrado
   arredondado preto, a linha azul do "placar", o ponto verde). Pillow não
   renderiza SVG; a geometria é reproduzida em código com supersampling 4x.
   A versão maskable tem a zona segura de 80%: o ícone ocupa o miolo e o fundo
   preenche o resto, porque o Android recorta em círculo/quadrado/gota.
2. **Lista de pré-cache do `sw.js`**: todo arquivo da pasta que o app precisa
   offline, menos o que não é asset (`_headers`, o próprio `sw.js`, robots e
   sitemap). O nome do cache leva o hash do CONTEÚDO desses arquivos
   (`fitrich-<12 hex>`): mudou um byte em qualquer um, muda o cache, o
   navegador instala a versão nova e `activate` apaga a antiga.

`tests/py/test_fitrich_plataforma.py` chama `conferir()`: HTML/SW/ícones editados à
mão ou esquecidos depois de mudar um arquivo falham o teste. Fica fora de
`app/` para não ser publicado junto com o site (mesmo arranjo do cpf_og.py).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FITRICH = AQUI.parent / "app"
SW = FITRICH / "sw.js"
ICONES = FITRICH / "icons"

# O que existe na pasta mas não entra no pré-cache: _headers é configuração do
# CDN (nunca é servido), sw.js é o próprio worker (o navegador o busca
# sozinho e no-cache), robots/sitemap são para robôs, não para a pessoa offline.
FORA_DO_PRECACHE = {"/_headers", "/sw.js", "/robots.txt", "/sitemap.xml"}
# Prefixos que também ficam fora: vitrine da loja (screenshots do manifest) não é preciso para usar o app offline.
PREFIXOS_FORA = ("/screenshots/",)
# Página servida num caminho de diretório: `/en/index.html` é pedida como `/en/`.
PAGINAS_DE_DIRETORIO = {"/index.html": "/", "/en/index.html": "/en/", "/privacidade/index.html": "/privacidade/", "/en/privacy/index.html": "/en/privacy/"}
MARCA_INI, MARCA_FIM = "/* gen:precache */", "/* /gen */"

# Geometria do favicon.svg (viewBox 64): rect rx=14 preto; polilinha azul 5 px; círculo verde r=5 em (52,14).
PRETO, AZUL, VERDE, BRANCO = (11, 11, 11), (57, 135, 229), (25, 158, 112), (255, 255, 255)
LINHA = [(10, 38), (20, 38), (26, 22), (36, 48), (43, 30), (54, 30)]


# ----------------------------------------------------------------------- ícones
def _desenhar(tamanho: int, *, maskable: bool, mono: bool = False):
    from PIL import Image, ImageDraw  # import tardio: só quem gera ícone precisa de Pillow

    SS = 4  # supersampling: desenha 4x maior e reduz com LANCZOS para as bordas saírem lisas
    t = tamanho * SS
    im = Image.new("RGBA", (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if mono:
        # Ícone monocromático (Android 13+ tematizado): só o alfa importa, o sistema pinta. Zona segura como a maskable.
        escala, desloc = t * 0.8 / 64, t * 0.1
    elif maskable:
        # Zona segura do maskable: o conteúdo cabe num círculo de 80% do lado; o fundo vai até a borda.
        d.rectangle((0, 0, t, t), fill=PRETO + (255,))
        escala, desloc = t * 0.8 / 64, t * 0.1
    else:
        escala, desloc = t / 64, 0
        d.rounded_rectangle((0, 0, t - 1, t - 1), radius=round(14 * escala), fill=PRETO + (255,))

    def p(x: float, y: float) -> tuple[float, float]:
        return (desloc + x * escala, desloc + y * escala)

    largura = round(5 * escala)
    linha, ponto = (BRANCO, BRANCO) if mono else (AZUL, VERDE)
    d.line([p(*xy) for xy in LINHA], fill=linha + (255,), width=largura, joint="curve")
    for xy in (LINHA[0], LINHA[-1]):  # stroke-linecap="round"
        cx, cy = p(*xy)
        d.ellipse((cx - largura / 2, cy - largura / 2, cx + largura / 2, cy + largura / 2), fill=linha + (255,))
    cx, cy = p(52, 14)
    r = 5 * escala
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ponto + (255,))
    return im.resize((tamanho, tamanho), Image.LANCZOS)


ICONES_PNG = {"icon-192.png": (192, False), "icon-512.png": (512, False),
              "icon-maskable-512.png": (512, True), "icon-monochrome-512.png": (512, "mono"), "apple-touch-icon.png": (180, False)}


def gerar_icones(destino: Path = ICONES) -> list[Path]:
    destino.mkdir(exist_ok=True)
    saidas = []
    for nome, (tamanho, maskable) in ICONES_PNG.items():
        im = _desenhar(tamanho, maskable=maskable is True, mono=maskable == "mono")
        if nome == "apple-touch-icon.png":
            im = im.convert("RGB")  # iOS ignora transparência e pinta de preto: já vai opaco
        im.save(destino / nome, "PNG", optimize=True)
        saidas.append(destino / nome)
    return saidas


# -------------------------------------------------------------------- pré-cache
def arquivos_publicados(pasta: Path = FITRICH) -> dict[str, Path]:
    return {"/" + p.relative_to(pasta).as_posix(): p for p in sorted(pasta.rglob("*")) if p.is_file() and not p.name.startswith(".")}


def lista_precache(pasta: Path = FITRICH) -> list[str]:
    """Caminhos a pré-cachear; `/index.html` entra como `/` porque é assim que a página é pedida
    (html_handling auto-trailing-slash redireciona /index.html para /)."""
    out = []
    for caminho in arquivos_publicados(pasta):
        if caminho in FORA_DO_PRECACHE or caminho.endswith(".md") or caminho.startswith(PREFIXOS_FORA):  # README de pasta: documentação, não app
            continue
        out.append(PAGINAS_DE_DIRETORIO.get(caminho, caminho))
    return sorted(out)


def hash_precache(pasta: Path = FITRICH) -> str:
    h = hashlib.sha256()
    arquivos = arquivos_publicados(pasta)
    for caminho in lista_precache(pasta):
        real = next((r for r, c in PAGINAS_DE_DIRETORIO.items() if c == caminho), caminho)
        h.update(caminho.encode() + b"\0" + arquivos[real].read_bytes() + b"\0")
    return h.hexdigest()[:12]


def bloco_precache(pasta: Path = FITRICH) -> str:
    lista = ",\n  ".join(json.dumps(c) for c in lista_precache(pasta))
    return (f"{MARCA_INI}\n// Gerado por scripts/fitrich_plataforma.py build: não edite à mão.\n"
            f'const CACHE = "fitrich-{hash_precache(pasta)}";\nconst PRECACHE = [\n  {lista}\n];\n{MARCA_FIM}')


_RE_BLOCO = re.compile(re.escape(MARCA_INI) + r".*?" + re.escape(MARCA_FIM), re.S)


def sw_gerado(pasta: Path = FITRICH) -> str:
    sw = (pasta / "sw.js").read_text(encoding="utf-8")
    if not _RE_BLOCO.search(sw):
        raise ValueError("sw.js sem as marcas /* gen:precache */ ... /* /gen */")
    return _RE_BLOCO.sub(lambda _m: bloco_precache(pasta), sw, count=1)


def gerar_sw(pasta: Path = FITRICH) -> bool:
    """Reescreve o bloco gerado do sw.js. Devolve True se mudou algo."""
    novo, atual = sw_gerado(pasta), (pasta / "sw.js").read_text(encoding="utf-8")
    if novo != atual:
        (pasta / "sw.js").write_text(novo, encoding="utf-8")
    return novo != atual


def conferir(pasta: Path = FITRICH) -> list[str]:
    """Lista o que diverge do que `build` geraria (vazio = tudo em dia)."""
    problemas = []
    if sw_gerado(pasta) != (pasta / "sw.js").read_text(encoding="utf-8"):
        problemas.append("sw.js: bloco de pré-cache desatualizado (rode build)")
    for nome in ICONES_PNG:
        if not (pasta / "icons" / nome).exists():
            problemas.append(f"icons/{nome} não existe (rode build)")
    return problemas


def main(argv: list[str]) -> int:
    if argv[:1] == ["build"]:
        for p in gerar_icones():
            print("ícone", p.relative_to(AQUI.parent), p.stat().st_size, "bytes")
        print("sw.js", "atualizado" if gerar_sw() else "já em dia", f"cache fitrich-{hash_precache()}", len(lista_precache()), "arquivos")
        return 0
    if argv[:1] == ["conferir"]:
        problemas = conferir()
        print("\n".join(problemas) if problemas else "em dia")
        return 1 if problemas else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
