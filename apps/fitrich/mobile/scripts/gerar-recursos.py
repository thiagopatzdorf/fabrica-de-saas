"""Gera os recursos de ícone e abertura (splash) que o `@capacitor/assets` espera em `assets/`.

    python3 mobile/scripts/gerar-recursos.py     # de qualquer pasta
    (depois, na pasta do app:)  npx capacitor-assets generate

Reusa a MESMA geometria dos ícones da PWA (`fitrich_plataforma._desenhar`, a partir do favicon.svg): a
identidade visual tem uma fonte só. Precisa de Pillow (só quem gera recursos; o CI não roda isto).
Saída (todos 1024 ou 2732 px): icon-only, icon-foreground (miolo na zona segura de 66% do ícone adaptativo do
Android), icon-background (cor lisa), splash e splash-dark.
"""
from __future__ import annotations

import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parents[1] / "scripts"))
import fitrich_plataforma as fp  # noqa: E402
from PIL import Image  # noqa: E402

SAIDA = AQUI.parent / "assets"
FUNDO_CLARO, FUNDO_ESCURO = (252, 252, 251), (26, 26, 25)  # --sup do tema claro e do escuro


def _miolo(tamanho: int, fracao: float) -> Image.Image:
    """Marca (linha azul + ponto verde) sem fundo, ocupando `fracao` do lado, centrada."""
    marca = fp._desenhar(tamanho, maskable=False, mono=False)
    lado = round(tamanho * fracao)
    return marca.resize((lado, lado), Image.LANCZOS)


def main() -> int:
    SAIDA.mkdir(exist_ok=True)
    fp._desenhar(1024, maskable=False).convert("RGBA").save(SAIDA / "icon-only.png", optimize=True)
    # Primeiro plano do ícone adaptativo: o Android recorta até 1/3 das bordas; a marca fica em 62% centrais.
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    m = _miolo(1024, 0.62)
    fg.paste(m, ((1024 - m.width) // 2, (1024 - m.height) // 2), m)
    fg.save(SAIDA / "icon-foreground.png", optimize=True)
    Image.new("RGBA", (1024, 1024), (11, 11, 11, 255)).save(SAIDA / "icon-background.png", optimize=True)
    for nome, fundo in (("splash.png", FUNDO_CLARO), ("splash-dark.png", FUNDO_ESCURO)):
        tela = Image.new("RGBA", (2732, 2732), fundo + (255,))
        m = _miolo(1024, 0.5)
        tela.paste(m, ((2732 - m.width) // 2, (2732 - m.height) // 2), m)
        tela.convert("RGB").save(SAIDA / nome, optimize=True)
    for p in sorted(SAIDA.glob("*.png")):
        print(p.relative_to(AQUI.parents[1]), p.stat().st_size, "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
