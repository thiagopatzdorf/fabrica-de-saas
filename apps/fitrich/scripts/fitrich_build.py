"""Gera `app/index.html` (pt-BR) e `app/en/index.html` (en) de UM template + um dicionário.

Uma página por idioma, porque o Fitrich é estático e `lang`, `title`, `description`, `canonical`,
`og:locale` e o `inLanguage` do JSON-LD têm de ser do idioma da página (hreflang recíproco entre as
duas). O texto da interface em si vem do `t()` do app; aqui só o que o HTML precisa antes do JS.

Uso (da raiz do projeto):  python3 scripts/fitrich_build.py          # escreve
                            python3 scripts/fitrich_build.py --check  # só confere (sai 1 se diferir)

A URL pública vem de FITRICH_BASE_URL (padrão: https://fitrich.example.com). Ela só entra em canonical,
hreflang, Open Graph, JSON-LD, sitemap.xml e robots.txt; troque pela sua e rode de novo ao publicar.
O teste `tests/py/test_fitrich_build.py` falha se o HTML commitado não for o que o template gera.
Só biblioteca padrão: o CI do site não tem pacotes.
"""
from __future__ import annotations

import html
import json
import os
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
TEMPLATE = AQUI / "fitrich_build" / "template.html"
FITRICH = RAIZ / "app"
BASE = os.environ.get("FITRICH_BASE_URL", "https://fitrich.example.com").rstrip("/")

IDIOMAS = {
    "pt-BR": {
        "caminho": "index.html",
        "raiz": "/",
        "canonical": f"{BASE}/",
        "og_locale": "pt_BR",
        "title": "Fitrich: finanças e shape num app só, grátis e sem cadastro",
        "description": "Quanto dá para gastar até o fim do mês, lançamento em 3 toques, cartão, metas e treino. Grátis, sem cadastro: seus dados ficam no seu aparelho.",
        "og_title": "Fitrich: finanças e shape num app só",
        "og_description": "Dá para gastar quanto? Lançar em 3 toques, cartão, metas e treino. Grátis, sem cadastro, sem enviar seus dados a ninguém.",
        "jsonld_description": "App pessoal de finanças e shape que funciona no próprio aparelho: safe-to-spend, lançamento rápido, cartão de crédito, metas, peso e treinos.",
        "app_nome": "Fitrich",
        "idioma": "Idioma",
        "tema": "Alternar tema claro e escuro",
        "secoes": "Seções",
        "sem_js": "O Fitrich precisa de JavaScript ligado para funcionar.",
        "lancar": "Lançar",
        "pular": "Pular para o conteúdo",
        "manifest": "/manifest.webmanifest",
        "manifest_id": "/",
        "manifest_nome": "Fitrich: finanças e shape",
        "manifest_descricao": "Finanças e shape num app só. Funciona sem internet e seus dados ficam no aparelho.",
        "atalho_lancar": "Lançar gasto",
        "atalho_lancar_curto": "Lançar",
        "atalho_lancar_desc": "Abre o Fitrich direto no lançamento de um gasto",
        "atalho_treino": "Registrar treino",
        "atalho_treino_curto": "Treino",
        "atalho_treino_desc": "Abre o Fitrich na tela de peso e treinos",
        "prefixo_url": "",
    },
    "en": {
        "caminho": "en/index.html",
        "raiz": "/en/",
        "canonical": f"{BASE}/en/",
        "og_locale": "en_US",
        "title": "Fitrich: money and fitness in one free app, no sign-up",
        "description": "How much is safe to spend until month end, 3-tap entries, credit cards, goals and workouts. Free, no account: your data stays on your device.",
        "og_title": "Fitrich: money and fitness in one app",
        "og_description": "Safe to spend how much? 3-tap entries, cards, goals and workouts. Free, no sign-up, nothing sent anywhere.",
        "jsonld_description": "Personal finance and fitness app that runs on your own device: safe-to-spend, quick entry, credit cards, goals, weight and workouts.",
        "app_nome": "Fitrich",
        "idioma": "Language",
        "tema": "Toggle light and dark theme",
        "secoes": "Sections",
        "sem_js": "Fitrich needs JavaScript enabled to work.",
        "lancar": "Add",
        "pular": "Skip to content",
        "manifest": "/en/manifest.webmanifest",
        "manifest_id": "/en/",
        "manifest_nome": "Fitrich: money and fitness",
        "manifest_descricao": "Money and fitness in one app. Works offline and your data stays on your device.",
        "atalho_lancar": "Add expense",
        "atalho_lancar_curto": "Add",
        "atalho_lancar_desc": "Opens Fitrich straight on the new-expense sheet",
        "atalho_treino": "Log workout",
        "atalho_treino_curto": "Workout",
        "atalho_treino_desc": "Opens Fitrich on the weight and workouts screen",
        "prefixo_url": "/en",
    },
}


def jsonld(idioma: str, t: dict) -> str:
    dados = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Fitrich",
        "url": t["canonical"],
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any browser" if idioma == "en" else "Qualquer navegador",
        "inLanguage": idioma,
        "description": t["jsonld_description"],
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "BRL"},
    }
    # `<` e `&` escapados dentro do <script>: o JSON continua válido e nada fecha a tag.
    return json.dumps(dados, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")


def render(idioma: str) -> str:
    t = IDIOMAS[idioma]
    valores = {k: html.escape(v, quote=True) for k, v in t.items() if k != "caminho"}
    valores["lang"] = idioma
    valores["base"] = html.escape(BASE, quote=True)
    valores["jsonld"] = jsonld(idioma, t)  # já seguro para <script>; não passa pelo escape de HTML
    valores["atual_pt"] = ' aria-current="page"' if idioma == "pt-BR" else ""
    valores["atual_en"] = ' aria-current="page"' if idioma == "en" else ""
    saida = TEMPLATE.read_text(encoding="utf-8")
    for chave, valor in valores.items():
        saida = saida.replace("{{" + chave + "}}", valor)
    sobrou = saida.split("{{")[1:]
    if sobrou:
        raise SystemExit("placeholder sem valor no template: " + sobrou[0].split("}}")[0])
    return saida


def manifest(idioma: str) -> str:
    """Um manifesto por idioma, do mesmo dicionário do HTML (nome, atalhos). `scope` é `/` nos dois para
    o app instalado poder trocar de idioma sem sair dele; `id` difere porque são duas entradas de instalação."""
    t = IDIOMAS[idioma]
    icone = lambda arquivo, tam, uso="any": {"src": f"/icons/{arquivo}", "sizes": f"{tam}x{tam}", "type": "image/png", "purpose": uso}  # noqa: E731
    dados = {
        "id": t["manifest_id"],
        "name": t["manifest_nome"],
        "short_name": "Fitrich",
        "description": t["manifest_descricao"],
        "lang": idioma,
        "dir": "ltr",
        "start_url": t["raiz"],
        "scope": "/",
        "display": "standalone",
        "display_override": ["standalone", "minimal-ui"],
        "orientation": "any",
        # Dois temas, uma só cor aqui: o manifesto não distingue claro/escuro. O <meta name="theme-color">
        # da página (tema.js) acompanha o tema de verdade; esta cor vale para a abertura (splash) no Android.
        "background_color": "#1A1A19",
        "theme_color": "#1A1A19",
        "categories": ["finance", "health", "lifestyle"],
        "prefer_related_applications": False,
        "launch_handler": {"client_mode": "focus-existing"},
        "icons": [icone("icon-192.png", 192), icone("icon-512.png", 512),
                  icone("icon-maskable-512.png", 512, "maskable"), icone("icon-monochrome-512.png", 512, "monochrome")],
        "shortcuts": [
            {"name": t["atalho_lancar"], "short_name": t["atalho_lancar_curto"], "description": t["atalho_lancar_desc"],
             "url": f"{t['prefixo_url']}/#/lancar", "icons": [icone("icon-192.png", 192)]},
            {"name": t["atalho_treino"], "short_name": t["atalho_treino_curto"], "description": t["atalho_treino_desc"],
             "url": f"{t['prefixo_url']}/#/shape", "icons": [icone("icon-192.png", 192)]},
        ],
    }
    shots = sorted((FITRICH / "screenshots").glob(f"{'en' if idioma == 'en' else 'pt'}-*.png")) if (FITRICH / "screenshots").is_dir() else []
    if shots:
        dados["screenshots"] = [{"src": f"/screenshots/{p.name}", "sizes": "780x1688", "type": "image/png", "form_factor": "narrow",
                                 "label": p.stem.split("-", 1)[1].replace("-", " ")} for p in shots]
    return json.dumps(dados, ensure_ascii=False, indent=2) + "\n"


PRIVACIDADE = {
    "pt-BR": {
        "caminho": "privacidade/index.html", "url": f"{BASE}/privacidade/", "outro": "/en/privacy/", "outro_lang": "en", "outro_rotulo": "English",
        "titulo": "Política de privacidade do Fitrich",
        "atualizada": "Atualizada em 5 de outubro de 2026.",
        "voltar": "Voltar ao Fitrich",
        "secoes": [
            ("Resumo", ["Nada do que você registra no Fitrich sai do seu aparelho. Não há conta, não há servidor nosso guardando dados e não há rastreamento."]),
            ("O que é guardado, e onde", ["Pesos, treinos, lançamentos, metas e preferências ficam no armazenamento do próprio aparelho (IndexedDB e localStorage do navegador ou do app). O projeto não recebe, não vê e não consegue recuperar esses dados."]),
            ("O que o Fitrich não faz", ["Não pede cadastro, e-mail, telefone nem localização. Não usa anúncios, analytics, cookies de terceiros nem SDK de terceiros. Não faz requisições de rede enquanto você usa o app: a política de segurança do site (connect-src 'none') faz o navegador bloquear qualquer envio."]),
            ("Permissões", ["No app instalado pela loja, a única permissão opcional é a de notificações, usada só para lembretes locais que você liga (por exemplo, lançar os gastos do dia). Ela é agendada no próprio aparelho, sem servidor."]),
            ("Backup e exportação", ["Você decide se, quando e para onde exportar uma cópia dos dados. O backup pode ser cifrado com uma senha que só você conhece; sem ela, nem nós nem ninguém abre o arquivo. Se você perder o aparelho e não tiver backup, os dados não podem ser recuperados."]),
            ("Apagar tudo", ["Na tela Dados há o botão para apagar todos os dados do aparelho. Desinstalar o app ou limpar os dados do site também apaga tudo."]),
            ("Crianças", ["O Fitrich é uma ferramenta de acompanhamento pessoal e não é dirigido a menores de 13 anos. Como não coleta dados, não há dado de criança a tratar."]),
            ("Aviso", ["O Fitrich não é aconselhamento médico, nutricional, financeiro nem de investimento."]),
            ("Mudanças e contato", ["Se esta política mudar, a data acima muda. Esta é a política do código-fonte; quem publica o Fitrich em um endereço próprio deve informar aqui o seu contato."]),
        ],
    },
    "en": {
        "caminho": "en/privacy/index.html", "url": f"{BASE}/en/privacy/", "outro": "/privacidade/", "outro_lang": "pt-BR", "outro_rotulo": "Português",
        "titulo": "Fitrich privacy policy",
        "atualizada": "Updated October 5, 2026.",
        "voltar": "Back to Fitrich",
        "secoes": [
            ("Summary", ["Nothing you record in Fitrich leaves your device. There is no account, no server of ours holding data and no tracking."]),
            ("What is stored, and where", ["Weights, workouts, transactions, goals and preferences live in your device's own storage (the browser's or the app's IndexedDB and localStorage). The project does not receive, see or recover this data."]),
            ("What Fitrich does not do", ["It asks for no sign-up, e-mail, phone number or location. It uses no ads, analytics, third-party cookies or third-party SDK. It makes no network requests while you use it: the site's security policy (connect-src 'none') makes the browser block any outgoing request."]),
            ("Permissions", ["In the app installed from a store, the only optional permission is notifications, used only for local reminders you turn on (for example, logging the day's spending). They are scheduled on the device itself, with no server."]),
            ("Backup and export", ["You decide if, when and where to export a copy of your data. The backup can be encrypted with a password only you know; without it, nobody can open the file. If you lose the device and have no backup, the data cannot be recovered."]),
            ("Erase everything", ["The Data screen has a button that erases all data on the device. Uninstalling the app or clearing site data also erases everything."]),
            ("Children", ["Fitrich is a personal tracking tool and is not directed at children under 13. Since it collects no data, there is no child data to handle."]),
            ("Notice", ["Fitrich is not medical, nutritional, financial or investment advice."]),
            ("Changes and contact", ["If this policy changes, the date above changes. This is the source-code policy; whoever publishes Fitrich at their own address should add their contact here."]),
        ],
    },
}


def render_privacidade(idioma: str) -> str:
    p = PRIVACIDADE[idioma]
    e = html.escape
    corpo = "\n".join(f"<h2>{e(tit)}</h2>\n" + "\n".join(f"<p>{e(par)}</p>" for par in pars) for tit, pars in p["secoes"])
    raiz = IDIOMAS[idioma]["raiz"]
    return f"""<!DOCTYPE html>
<html lang="{idioma}" data-gs-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(p['titulo'])}</title>
<meta name="description" content="{e(p['secoes'][0][1][0])}">
<link rel="canonical" href="{p['url']}">
<meta name="theme-color" content="#1A1A19">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script src="/js/tema.js"></script>
<link rel="stylesheet" href="/css/legal.css">
</head>
<body>
<main>
<p><a href="{raiz}">{e(p['voltar'])}</a> · <a href="{p['outro']}" lang="{p['outro_lang']}" hreflang="{p['outro_lang']}">{e(p['outro_rotulo'])}</a></p>
<h1>{e(p['titulo'])}</h1>
<p class="data">{e(p['atualizada'])}</p>
{corpo}
</main>
</body>
</html>
"""


def sitemap() -> str:
    linhas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for idioma, t in IDIOMAS.items():
        linhas.append("  <url>")
        linhas.append(f"    <loc>{t['canonical']}</loc>")
        for outro, u in IDIOMAS.items():
            linhas.append(f'    <xhtml:link rel="alternate" hreflang="{outro}" href="{u["canonical"]}"/>')
        linhas.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{IDIOMAS["pt-BR"]["canonical"]}"/>')
        linhas.append("  </url>")
    linhas.append("</urlset>")
    return "\n".join(linhas) + "\n"


def robots() -> str:
    return f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n"


def saidas() -> dict[Path, str]:
    arquivos = {FITRICH / t["caminho"]: render(idioma) for idioma, t in IDIOMAS.items()}
    arquivos[FITRICH / "sitemap.xml"] = sitemap()
    arquivos[FITRICH / "robots.txt"] = robots()
    for idioma, t in IDIOMAS.items():
        arquivos[FITRICH / t["manifest"].lstrip("/")] = manifest(idioma)
        arquivos[FITRICH / PRIVACIDADE[idioma]["caminho"]] = render_privacidade(idioma)
    return arquivos


def main(argv: list[str]) -> int:
    conferir = "--check" in argv
    diferentes = []
    for caminho, conteudo in saidas().items():
        atual = caminho.read_text(encoding="utf-8") if caminho.exists() else None
        if atual == conteudo:
            continue
        diferentes.append(caminho)
        if not conferir:
            caminho.parent.mkdir(parents=True, exist_ok=True)
            caminho.write_text(conteudo, encoding="utf-8")
    for c in diferentes:
        print(("difere: " if conferir else "escrito: ") + str(c.relative_to(RAIZ)))
    return 1 if (conferir and diferentes) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
