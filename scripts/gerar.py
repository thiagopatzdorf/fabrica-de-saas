#!/usr/bin/env python3
"""Gera README.md, catalogo/<categoria>.md, catalogo.json, catalogo.csv, llms.txt, llms-full.txt,
docs/estatisticas.md e schema/saas.schema.json a partir de catalogo/*.yml + catalogo/verificado.json
+ apps/apps.yml. Determinístico: mesmos dados, mesmos bytes. Nenhum número é digitado à mão.

Uso:
  python3 scripts/gerar.py              # escreve os arquivos
  python3 scripts/gerar.py --conferir   # exit 1 se algum arquivo gerado difere do disco (CI)
"""
from __future__ import annotations

import argparse
import csv
import io
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogo as cat  # noqa: E402

RAIZ_PADRAO = Path(__file__).resolve().parent.parent
MARCA = "<!-- gerado por scripts/gerar.py; não edite à mão (ver AGENTS.md). Fontes: catalogo/*.yml, catalogo/verificado.json, apps/apps.yml -->"
ARQUIVOS_FIXOS = ["README.md", "catalogo.json", "catalogo.csv", "llms.txt", "llms-full.txt",
                  "docs/estatisticas.md", "schema/saas.schema.json"]


# ---------------------------------------------------------------- dados
def juntar(categorias: dict[str, dict], verificado: dict) -> dict:
    """Junta YAML + fatos. Devolve itens listáveis (ok/rebaixado) e as contagens."""
    fatos = verificado.get("repos", {})
    itens, contagem = [], Counter()
    for slug in sorted(categorias):
        c = categorias[slug]
        for it in c["itens"]:
            f = fatos.get(it["repo"].lower())
            if f is None:
                contagem["pendente"] += 1
                continue
            contagem[f["status"]] += 1
            if f["status"] == "excluido":
                continue
            canonico = f["canonico"] or it["repo"]
            itens.append({
                "categoria": slug, "repo": canonico, "url": f"https://github.com/{canonico}",
                "nome": it["nome"], "alternativa_a": list(it.get("alternativa_a") or []),
                "pt": it["pt"], "en": it["en"], "stack": list(it["stack"]),
                "site": it.get("site"), "open_core": bool(it.get("open_core", False)),
                "nota": it.get("nota"), "destaque": bool(it.get("destaque", False)),
                "licenca": f["spdx"], "estrelas": f["estrelas"], "ultimo_push": f["pushed_at"],
                "status": f["status"], "motivo": f["motivo"], "aviso": f.get("aviso", ""),
            })
    itens.sort(key=lambda i: (i["categoria"], -i["estrelas"], i["repo"].lower()))
    por_cat = {}
    for slug in sorted(categorias):
        mine = [i for i in itens if i["categoria"] == slug]
        por_cat[slug] = {
            "slug": slug, "titulo_pt": categorias[slug]["titulo_pt"], "titulo_en": categorias[slug]["titulo_en"],
            "ativos": sum(1 for i in mine if i["status"] == "ok"),
            "rebaixados": sum(1 for i in mine if i["status"] == "rebaixado"),
        }
    alternativas = {}
    for i in itens:
        for a in i["alternativa_a"]:
            alternativas.setdefault(a.casefold(), a)
    return {
        "itens": itens, "categorias": por_cat, "contagem": dict(contagem),
        "gerado_em": verificado.get("gerado_em"),
        "ativos": sum(1 for i in itens if i["status"] == "ok"),
        "rebaixados": sum(1 for i in itens if i["status"] == "rebaixado"),
        "alternativas": len(alternativas),
        "licencas": dict(sorted(Counter(i["licenca"] for i in itens).items())),
    }


def data_curta(iso):
    return iso[:10] if iso else "ainda não verificado"


# ---------------------------------------------------------------- markdown
def esc(texto: str) -> str:
    """Escapa o que quebra tabela ou vira formatação/HTML por acidente."""
    for ch in ("\\", "|", "`", "*", "_", "[", "]", "<", ">"):
        texto = texto.replace(ch, "\\" + ch)
    return texto


def compacto(n: int) -> str:
    return str(n) if n < 1000 else f"{n / 1000:.1f}k"


def linha_tabela(i: dict) -> str:
    nome = f"[{esc(i['nome'])}]({i['url']})"
    subst = ", ".join(esc(a) for a in i["alternativa_a"]) or "-"
    lic = esc(i["licenca"]) + (" (open core)" if i["open_core"] else "")
    mes = i["ultimo_push"][:7]
    ativ = mes if i["status"] == "ok" else f"{mes} (parado)"
    desc = esc(i["pt"]) + (f" *{esc(i['nota'])}*" if i["nota"] else "")
    return f"| {nome} | {subst} | {lic} | {compacto(i['estrelas'])} | {ativ} | {esc(', '.join(i['stack']))} | {desc} |"


def pagina_categoria(d: dict, slug: str) -> str:
    c = d["categorias"][slug]
    itens = [i for i in d["itens"] if i["categoria"] == slug]
    out = [MARCA, "", f"# {c['titulo_pt']}", "", f"*{c['titulo_en']}*", "",
           f"[Voltar ao catálogo](../README.md) · [Back to the catalog](../README.md)", "",
           f"{c['ativos']} ativos e {c['rebaixados']} rebaixados (sem push há mais de {cat.MESES_INATIVO} meses). "
           f"Licença, estrelas e atividade conferidas no GitHub em {data_curta(d['gerado_em'])}. "
           f"Ordenado por estrelas.", ""]
    if itens:
        out += ["| Nome | Substitui | Licença | ★ | Atividade | Stack | Descrição |",
                "|---|---|---|---:|---|---|---|"]
        out += [linha_tabela(i) for i in itens]
    else:
        out.append("Nenhum item verificado nesta categoria ainda.")
    out += ["", "Falta algum? [Como adicionar](../CONTRIBUTING.md). "
            "Missing one? [How to add it](../CONTRIBUTING.md#english).", ""]
    return "\n".join(out)


def readme(d: dict, apps: list[dict]) -> str:
    n_cat, n_apps = len(d["categorias"]), len(apps)
    listados = d["ativos"] + d["rebaixados"]
    testes = sum(a["testes"] for a in apps)
    L = [MARCA, "", "# Fábrica de SaaS", "",
         "[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)", "",
         f"**O catálogo verificado de SaaS open source, lido por pessoas e por agentes de IA, mais {n_apps} produtos nossos prontos para usar (MIT).**", "",
         f"**The verified catalog of open source SaaS, read by humans and AI agents, plus {n_apps} products of our own, ready to use (MIT).**", "",
         f"Hoje: **{listados}** projetos em **{n_cat}** categorias, alternativas a **{d['alternativas']}** SaaS proprietários "
         f"({d['ativos']} ativos, {d['rebaixados']} sem push há mais de {cat.MESES_INATIVO} meses). "
         f"Licença, estrelas e atividade são conferidas direto no GitHub (última verificação: {data_curta(d['gerado_em'])}); "
         f"repositório arquivado, sem licença clara ou com licença fora da [lista aceita](LICENSE-POLICY.md) fica de fora.", "",
         f"Today: **{listados}** projects in **{n_cat}** categories, alternatives to **{d['alternativas']}** proprietary SaaS tools "
         f"({d['ativos']} active, {d['rebaixados']} with no push in over {cat.MESES_INATIVO} months). "
         f"License, stars and activity are checked straight from GitHub (last check: {data_curta(d['gerado_em'])}); "
         f"archived repos, unclear licenses and licenses outside the [accepted list](LICENSE-POLICY.md) are left out.", "",
         "O catálogo só **aponta** para os projetos: nenhum código ou texto de terceiros é copiado (ver [NOTICE.md](NOTICE.md)). / "
         "The catalog only **links** to projects: no third-party code or text is copied.", "",
         "## Para agentes / For agents", "",
         "- [`AGENTS.md`](AGENTS.md): mapa dos arquivos, formato de entrada e comandos exatos. / file map, input format and exact commands.",
         "- [`llms.txt`](llms.txt) e [`llms-full.txt`](llms-full.txt): o catálogo em texto compacto, uma linha por projeto. / the catalog as compact text, one line per project.",
         "- [`catalogo.json`](catalogo.json) e [`catalogo.csv`](catalogo.csv): dados estruturados; esquema em [`schema/saas.schema.json`](schema/saas.schema.json). / structured data.",
         "- Arquivos gerados nunca se editam à mão: mude `catalogo/*.yml` e rode `python3 scripts/gerar.py`. / generated files are never edited by hand.", "",
         "## Código nosso / Our code", "",
         f"{n_apps} produtos nesta árvore, em [`apps/`](apps), cada um roda sozinho e tem testes ({testes} no total, medidos no dia da publicação). / "
         f"{n_apps} products in this tree, each runs on its own and has tests ({testes} in total).", "",
         "| # | Produto | O que faz | Stack | Testes |", "|---:|---|---|---|---:|"]
    for n, a in enumerate(apps, 1):
        L.append(f"| {n} | [`{a['pasta']}`](apps/{a['pasta']}) | {esc(a['pt'])} | {esc(', '.join(a['stack']))} | {a['testes']} |")
    L += ["", "Cada pasta de `apps/` tem README próprio (em inglês e português) / each folder has its own bilingual README.", ""]
    dest = [i for i in d["itens"] if i["destaque"] and i["status"] == "ok"]
    if dest:
        L += ["## Destaques / Highlights", ""]
        for i in sorted(dest, key=lambda i: (i["categoria"], -i["estrelas"], i["repo"].lower())):
            alt = f", substitui {', '.join(esc(a) for a in i['alternativa_a'])}" if i["alternativa_a"] else ""
            L.append(f"- **[{esc(i['nome'])}]({i['url']})** ({esc(d['categorias'][i['categoria']]['titulo_pt'])}, "
                     f"{esc(i['licenca'])}, ★ {compacto(i['estrelas'])}{alt}): {esc(i['pt'])}")
        L.append("")
    L += ["## Catálogo / Catalog", "",
          "Uma página por categoria, com tabela de licença, estrelas, atividade e stack. / One page per category.", ""]
    for slug, c in d["categorias"].items():
        L.append(f"- [{esc(c['titulo_pt'])}](catalogo/{slug}.md) / {esc(c['titulo_en'])}: "
                 f"ativos {c['ativos']}, parados {c['rebaixados']}")
    L += ["", "Números por categoria e por licença: [docs/estatisticas.md](docs/estatisticas.md).", "",
          "## Como contribuir / Contributing", "",
          "Para incluir um SaaS, edite **um** arquivo `catalogo/<categoria>.yml` e abra um PR; o CI valida o esquema e a licença é conferida no GitHub. "
          "Detalhes e o que será recusado em [CONTRIBUTING.md](CONTRIBUTING.md). / "
          "To add a SaaS, edit **one** `catalogo/<category>.yml` and open a PR; CI validates the schema and the license is checked on GitHub. See [CONTRIBUTING.md](CONTRIBUTING.md#english).", "",
          "## Política de licença / License policy", "",
          f"Entram projetos com licença open source aprovada (lista de {len(cat.LICENCAS_ACEITAS)} identificadores SPDX). "
          "Não entram BSL, SSPL, Elastic, Commons Clause nem \"fair-code\": essas licenças restringem uso ou revenda. "
          "Open core entra, marcado. Copyleft (GPL, AGPL) entra porque o catálogo só linka. Tabela completa e motivos em [LICENSE-POLICY.md](LICENSE-POLICY.md). / "
          "Only OSI-style open source licenses are listed; source-available and fair-code licenses are not. Open core is listed and flagged.", "",
          "## Avisos honestos / Honest warnings", "",
          "- A licença é a que o GitHub informa no momento da verificação; confirme no repositório antes de adotar. / The license is what GitHub reports at check time; confirm in the repo before adopting.",
          "- Estar aqui não é recomendação nem auditoria: ninguém testou cada projeto. / Being listed is neither an endorsement nor an audit.",
          "- Os produtos de `apps/` são código real e testado, mas **nunca auditado por terceiros**; revise dependências, troque todos os segredos de exemplo e rode os testes no seu ambiente. / The `apps/` products are real, tested code, never audited by third parties."]
    for a in apps:
        if a.get("aviso_pt"):
            L.append(f"- `{a['pasta']}`: {a['aviso_pt']}" + (f" / {a['aviso_en']}" if a.get("aviso_en") else ""))
    L += ["", "## Licença e atribuição / License and attribution", "",
          "O conteúdo deste repositório (catálogo, scripts e `apps/`) é [MIT](LICENSE). Os projetos catalogados mantêm as licenças e as marcas de seus donos; "
          "fontes de inspiração e atribuições em [NOTICE.md](NOTICE.md). / "
          "This repository's own content is MIT. Cataloged projects keep their owners' licenses and trademarks.", ""]
    return "\n".join(L)


def estatisticas(d: dict, apps: list[dict]) -> str:
    total = len(d["itens"])
    L = [MARCA, "", "# Estatísticas / Statistics", "",
         f"Dados verificados em {data_curta(d['gerado_em'])}. Tudo aqui é contado a partir de `catalogo.json`.", "",
         "## Totais", "", "| Medida | Valor |", "|---|---:|",
         f"| Projetos listados | {total} |", f"| Ativos | {d['ativos']} |",
         f"| Rebaixados (sem push há mais de {cat.MESES_INATIVO} meses) | {d['rebaixados']} |",
         f"| Excluídos pelo verificador | {d['contagem'].get('excluido', 0)} |",
         f"| Aguardando verificação | {d['contagem'].get('pendente', 0)} |",
         f"| Categorias | {len(d['categorias'])} |",
         f"| SaaS proprietários que têm alternativa | {d['alternativas']} |",
         f"| Open core | {sum(1 for i in d['itens'] if i['open_core'])} |",
         f"| Produtos próprios em `apps/` | {len(apps)} |",
         f"| Testes dos produtos próprios | {sum(a['testes'] for a in apps)} |", "",
         "## Por categoria", "", "| Categoria | Ativos | Rebaixados | Total |", "|---|---:|---:|---:|"]
    for slug, c in d["categorias"].items():
        L.append(f"| [{esc(c['titulo_pt'])}](../catalogo/{slug}.md) | {c['ativos']} | {c['rebaixados']} | {c['ativos'] + c['rebaixados']} |")
    L += ["", "## Por licença", "", "| Licença (SPDX) | Projetos | Parte |", "|---|---:|---:|"]
    for lic, n in sorted(d["licencas"].items(), key=lambda kv: (-kv[1], kv[0])):
        L.append(f"| {esc(lic)} | {n} | {100 * n / total:.1f}% |")
    L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------- dados estruturados
def _csv_seguro(v) -> str:
    s = str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def catalogo_json(d: dict) -> str:
    meta = {"gerado_em": d["gerado_em"], "esquema": f"{cat.URL_RAW}/schema/saas.schema.json",
            "total": len(d["itens"]), "ativos": d["ativos"], "rebaixados": d["rebaixados"],
            "excluidos": d["contagem"].get("excluido", 0), "pendentes": d["contagem"].get("pendente", 0),
            "alternativas": d["alternativas"], "licencas": d["licencas"],
            "categorias": list(d["categorias"].values())}
    return cat.serializar_json({"meta": meta, "itens": d["itens"]})


def catalogo_csv(d: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["categoria", "nome", "repo", "url", "licenca", "estrelas", "ultimo_push", "status",
                "open_core", "alternativa_a", "stack", "site", "pt", "en"])
    for i in d["itens"]:
        w.writerow([_csv_seguro(x) for x in (
            i["categoria"], i["nome"], i["repo"], i["url"], i["licenca"], i["estrelas"], i["ultimo_push"],
            i["status"], "true" if i["open_core"] else "false", ";".join(i["alternativa_a"]),
            ";".join(i["stack"]), i["site"] or "", i["pt"], i["en"])])
    return buf.getvalue()


def llms_txt(d: dict, apps: list[dict]) -> str:
    L = ["# Fábrica de SaaS", "",
         f"> Catálogo verificado de SaaS open source ({d['ativos'] + d['rebaixados']} projetos em {len(d['categorias'])} categorias, "
         f"licença e atividade conferidas no GitHub em {data_curta(d['gerado_em'])}) mais {len(apps)} produtos próprios em MIT. "
         f"Verified catalog of open source SaaS alternatives, plus {len(apps)} MIT products of our own.", "",
         "O catálogo só aponta para os projetos; nada de terceiros é copiado. Fatos (licença SPDX, estrelas, último push) vêm da API do GitHub, "
         "descrições são nossas, em português e inglês. / The catalog only links to projects; facts come from the GitHub API, descriptions are ours.", "",
         "## Dados / Data", "",
         f"- [catalogo.json]({cat.URL_RAW}/catalogo.json): um objeto por projeto, com `meta` e esquema / one object per project",
         f"- [catalogo.csv]({cat.URL_RAW}/catalogo.csv): a mesma tabela em CSV / same data as CSV",
         f"- [llms-full.txt]({cat.URL_RAW}/llms-full.txt): o catálogo inteiro, uma linha por projeto / full catalog, one line per project",
         f"- [schema/saas.schema.json]({cat.URL_RAW}/schema/saas.schema.json): esquema JSON / JSON Schema", "",
         "## Docs", "",
         f"- [AGENTS.md]({cat.URL_RAW}/AGENTS.md): como consultar, propor entradas e verificar localmente / how to query, propose entries and verify",
         f"- [LICENSE-POLICY.md]({cat.URL_RAW}/LICENSE-POLICY.md): licenças aceitas e recusadas / accepted and rejected licenses",
         f"- [CONTRIBUTING.md]({cat.URL_RAW}/CONTRIBUTING.md): como adicionar um SaaS / how to add a SaaS",
         f"- [docs/estatisticas.md]({cat.URL_RAW}/docs/estatisticas.md): contagens / counts", "",
         "## Categorias / Categories", ""]
    for slug, c in d["categorias"].items():
        L.append(f"- [{c['titulo_pt']} / {c['titulo_en']}]({cat.URL_RAW}/catalogo/{slug}.md): {c['ativos'] + c['rebaixados']} projetos")
    L += ["", "## Código nosso / Our code", ""]
    for a in apps:
        L.append(f"- [{a['nome']}]({cat.URL_BLOB}/apps/{a['pasta']}): {a['en']}")
    L.append("")
    return "\n".join(L)


def _lf(texto: str) -> str:
    """O llms-full separa campos por ' | ': barra vertical dentro do texto viraria campo falso."""
    return texto.replace("|", "/")


def llms_full(d: dict, apps: list[dict]) -> str:
    L = ["# Fábrica de SaaS: catálogo completo / full catalog", "",
         f"Gerado em {data_curta(d['gerado_em'])}. Formato: nome | repo | licença | estrelas | substitui | descrição en | descrição pt. "
         "Marcadores: [open core], [parado] (sem push há mais de "
         f"{cat.MESES_INATIVO} meses).", ""]
    for slug, c in d["categorias"].items():
        L += [f"## {slug}: {c['titulo_pt']} / {c['titulo_en']}", ""]
        for i in (x for x in d["itens"] if x["categoria"] == slug):
            marcas = (" [open core]" if i["open_core"] else "") + (" [parado]" if i["status"] == "rebaixado" else "")
            L.append(f"{_lf(i['nome'])}{marcas} | {i['repo']} | {i['licenca']} | {i['estrelas']} | "
                     f"{_lf(', '.join(i['alternativa_a'])) or '-'} | {_lf(i['en'])} | {_lf(i['pt'])}")
        L.append("")
    L += ["## apps: código nosso / our code", ""]
    for a in apps:
        L.append(f"{_lf(a['nome'])} | apps/{a['pasta']} | MIT | - | - | {_lf(a['en'])} | {_lf(a['pt'])}")
    L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------- esquema JSON (gerado das mesmas constantes)
def esquema() -> str:
    def texto(maximo, minimo=1):
        return {"type": "string", "minLength": minimo, "maxLength": maximo}
    lista = lambda maximo, tam, minimo=0: {"type": "array", "minItems": minimo, "maxItems": maximo,  # noqa: E731
                                          "items": texto(tam)}
    sem_url = {"not": {"pattern": r"(?i)(https?://|www\.|ftp://)"}}
    item_in = {"type": "object", "additionalProperties": False, "required": ["repo", "nome", "pt", "en", "stack"],
               "properties": {
                   "repo": {"type": "string", "pattern": r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"},
                   "nome": {**texto(cat.MAX_NOME), **sem_url},
                   "alternativa_a": lista(cat.MAX_ALTERNATIVAS, cat.MAX_ALTERNATIVA),
                   "pt": {**texto(cat.MAX_FRASE), **sem_url}, "en": {**texto(cat.MAX_FRASE), **sem_url},
                   "stack": lista(cat.MAX_STACK, cat.MAX_ITEM_STACK, 1),
                   "site": {"type": "string", "pattern": r"^https?://\S+$"},
                   "open_core": {"type": "boolean"}, "nota": {**texto(cat.MAX_NOTA), **sem_url},
                   "destaque": {"type": "boolean"}}}
    cat_in = {"type": "object", "additionalProperties": False,
              "required": ["categoria", "titulo_pt", "titulo_en", "itens"],
              "properties": {"categoria": {"type": "string", "pattern": cat.RE_SLUG.pattern},
                             "titulo_pt": texto(cat.MAX_NOME), "titulo_en": texto(cat.MAX_NOME),
                             "itens": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/item_entrada"}}}}
    item_out = {"type": "object", "additionalProperties": False,
                "required": ["categoria", "repo", "url", "nome", "alternativa_a", "pt", "en", "stack", "site", "open_core",
                             "nota", "destaque", "licenca", "estrelas", "ultimo_push", "status", "motivo", "aviso"],
                "properties": {
                    "categoria": {"type": "string"}, "repo": {"type": "string"}, "url": {"type": "string"},
                    "nome": {"type": "string"}, "alternativa_a": {"type": "array", "items": {"type": "string"}},
                    "pt": texto(cat.MAX_FRASE), "en": texto(cat.MAX_FRASE),
                    "stack": {"type": "array", "maxItems": cat.MAX_STACK, "items": {"type": "string"}},
                    "site": {"type": ["string", "null"]}, "open_core": {"type": "boolean"},
                    "nota": {"type": ["string", "null"]}, "destaque": {"type": "boolean"},
                    "licenca": {"enum": list(cat.LICENCAS_ACEITAS)}, "estrelas": {"type": "integer", "minimum": 0},
                    "ultimo_push": {"type": "string"}, "status": {"enum": ["ok", "rebaixado"]},
                    "motivo": {"type": "string"}, "aviso": {"type": "string"}}}
    cat_json = {"type": "object", "additionalProperties": False, "required": ["meta", "itens"],
                "properties": {"meta": {"type": "object", "required": ["gerado_em", "total", "ativos", "rebaixados", "categorias"]},
                               "itens": {"type": "array", "items": {"$ref": "#/$defs/item_catalogo"}}}}
    ver = {"type": "object", "required": ["gerado_em", "repos"], "properties": {
        "gerado_em": {"type": ["string", "null"]},
        "repos": {"type": "object", "additionalProperties": {
            "type": "object", "required": ["canonico", "spdx", "estrelas", "pushed_at", "arquivado", "status", "motivo"],
            "properties": {"canonico": {"type": "string"}, "spdx": {"type": "string"},
                           "estrelas": {"type": "integer", "minimum": 0}, "pushed_at": {"type": "string"},
                           "arquivado": {"type": "boolean"}, "status": {"enum": list(cat.STATUS)},
                           "motivo": {"type": "string"}, "aviso": {"type": "string"}}}}}}
    schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": f"{cat.URL_RAW}/schema/saas.schema.json",
              "title": "Fábrica de SaaS",
              "description": "Gerado por scripts/gerar.py. Raiz: use #/$defs/categoria (catalogo/<slug>.yml lido como JSON), "
                             "#/$defs/catalogo (catalogo.json) ou #/$defs/verificado (catalogo/verificado.json).",
              "$defs": {"categoria": cat_in, "item_entrada": item_in, "catalogo": cat_json,
                        "item_catalogo": item_out, "verificado": ver}}
    return cat.serializar_json(schema)


# ---------------------------------------------------------------- orquestração
def gerar_tudo(categorias: dict[str, dict], apps: list[dict], verificado: dict) -> dict[str, str]:
    d = juntar(categorias, verificado)
    saida = {"README.md": readme(d, apps), "catalogo.json": catalogo_json(d), "catalogo.csv": catalogo_csv(d),
             "llms.txt": llms_txt(d, apps), "llms-full.txt": llms_full(d, apps),
             "docs/estatisticas.md": estatisticas(d, apps), "schema/saas.schema.json": esquema()}
    for slug in d["categorias"]:
        saida[f"catalogo/{slug}.md"] = pagina_categoria(d, slug)
    return {k: (v if v.endswith("\n") else v + "\n") for k, v in saida.items()}


def obsoletos(raiz: Path, esperado: dict[str, str]) -> list[str]:
    """catalogo/*.md gerados de categorias que não existem mais (reconhece pela marca)."""
    achados = []
    pasta = raiz / "catalogo"
    if pasta.is_dir():
        for p in sorted(pasta.glob("*.md")):
            rel = f"catalogo/{p.name}"
            if rel not in esperado and p.read_text(encoding="utf-8").startswith("<!-- gerado por scripts/gerar.py"):
                achados.append(rel)
    return achados


def principal(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", type=Path, default=RAIZ_PADRAO)
    ap.add_argument("--conferir", action="store_true", help="exit 1 se algum gerado difere do disco")
    a = ap.parse_args(argv)
    categorias, erros = cat.carregar_categorias(a.raiz)
    apps, e2 = cat.carregar_apps(a.raiz)
    verificado, e3 = cat.carregar_verificado(a.raiz)
    erros += e2 + e3
    if erros:
        print(f"{len(erros)} erro(s) nos dados; corrija antes de gerar:", file=sys.stderr)
        for e in erros:
            print(f"  {e}", file=sys.stderr)
        return 2
    esperado = gerar_tudo(categorias, apps, verificado)
    velhos = obsoletos(a.raiz, esperado)
    pend = [r for r in cat.todos_os_repos(categorias) if r.lower() not in verificado["repos"]]
    if pend:
        print(f"aviso: {len(pend)} repo(s) ainda sem verificação (rode scripts/verificar.py): {', '.join(pend[:5])}"
              + ("..." if len(pend) > 5 else ""), file=sys.stderr)
    if a.conferir:
        diferentes = []
        for rel, conteudo in sorted(esperado.items()):
            p = a.raiz / rel
            if not p.is_file() or p.read_bytes() != conteudo.encode("utf-8"):
                diferentes.append(rel)
        diferentes += [f"{r} (obsoleto, deve ser removido)" for r in velhos]
        if diferentes:
            print("arquivos gerados fora de sincronia com os dados:", file=sys.stderr)
            for r in diferentes:
                print(f"  {r}", file=sys.stderr)
            print("rode: python3 scripts/gerar.py  e commite o resultado", file=sys.stderr)
            return 1
        print(f"ok: {len(esperado)} arquivos gerados conferem com o disco")
        return 0
    for rel, conteudo in sorted(esperado.items()):
        p = a.raiz / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(conteudo.encode("utf-8"))
    for rel in velhos:
        (a.raiz / rel).unlink()
    print(f"gerados {len(esperado)} arquivos" + (f", removidos {len(velhos)} obsoletos" if velhos else ""))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
