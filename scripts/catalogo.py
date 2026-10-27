"""Biblioteca comum de verificar.py e gerar.py: carga, validação e regras do catálogo.

Tudo que é REGRA (limites, licenças aceitas, prazo de inatividade) mora aqui e só aqui:
o esquema JSON, a validação e os textos gerados leem estas constantes. Duas cópias da mesma
regra divergem, sempre.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml

# ---------------------------------------------------------------- configuração
REPO_GITHUB = "thiagopatzdorf/fabrica-de-saas"
RAMO = "main"
URL_REPO = f"https://github.com/{REPO_GITHUB}"
URL_RAW = f"https://raw.githubusercontent.com/{REPO_GITHUB}/{RAMO}"
URL_BLOB = f"{URL_REPO}/blob/{RAMO}"

MAX_FRASE = 140          # pt e en
MAX_NOME = 60
MAX_NOTA = 200
MAX_STACK = 4
MAX_ITEM_STACK = 30
MAX_ALTERNATIVA = 40
MAX_ALTERNATIVAS = 10
MESES_INATIVO = 18       # último push mais velho que isto => rebaixado

LICENCAS_ACEITAS = (
    "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "CC0-1.0",
    "MPL-2.0", "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0", "LGPL-3.0-only",
    "LGPL-3.0-or-later", "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0",
    "GPL-3.0-only", "GPL-3.0-or-later", "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
    "EUPL-1.2", "EPL-2.0", "Zlib",
)
# Recusadas de propósito, com o motivo que aparece no verificado.json. Qualquer SPDX que não
# esteja em LICENCAS_ACEITAS é recusada; esta tabela só dá a explicação específica.
LICENCAS_NAO_ABERTAS = {
    "BUSL-1.1": "BUSL-1.1 é source-available (converte para open source só depois de anos), não é open source",
    "SSPL-1.0": "SSPL-1.0 não é aprovada pela OSI e restringe oferecer como serviço, não é open source",
    "Elastic-2.0": "Elastic-2.0 proíbe oferecer como serviço gerenciado, não é open source",
    "Commons-Clause": "Commons Clause proíbe revender o software, não é open source",
    "Commons Clause": "Commons Clause proíbe revender o software, não é open source",
}
LICENCAS_NAO_IDENTIFICADAS = ("", "NOASSERTION", "Other", "OTHER", "NONE")

STATUS = ("ok", "rebaixado", "excluido")

RE_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
RE_REPO = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
RE_URL_NO_TEXTO = re.compile(r"(https?://|www\.|ftp://)", re.IGNORECASE)
RE_SITE = re.compile(r"^https?://[^\s]+$")

CHAVES_CATEGORIA = {"categoria", "titulo_pt", "titulo_en", "itens"}
CHAVES_ITEM = {"repo", "nome", "alternativa_a", "pt", "en", "stack", "site", "open_core", "nota", "destaque"}
CHAVES_APP = {"pasta", "nome", "pt", "en", "stack", "testes", "aviso_pt", "aviso_en"}


# ---------------------------------------------------------------- YAML estrito
class _Loader(yaml.SafeLoader):
    """SafeLoader que recusa chave duplicada (o PyYAML padrão fica com a última em silêncio)."""


def _mapa_sem_duplicata(loader, node, deep=False):
    vistas = set()
    for chave_no, _ in node.value:
        chave = loader.construct_object(chave_no, deep=deep)
        if chave in vistas:
            raise yaml.constructor.ConstructorError(
                None, None, f"chave duplicada: {chave!r}", chave_no.start_mark)
        vistas.add(chave)
    return yaml.SafeLoader.construct_mapping(loader, node, deep)


_Loader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapa_sem_duplicata)


def ler_yaml(caminho: Path):
    with open(caminho, encoding="utf-8") as f:
        return yaml.load(f, Loader=_Loader)  # noqa: S506 - _Loader herda de SafeLoader


# ---------------------------------------------------------------- validação
def _texto(valor, campo, onde, erros, *, maximo, obrigatorio=True, sem_url=False):
    if valor is None:
        if obrigatorio:
            erros.append(f"{onde}: campo obrigatório ausente: {campo}")
        return
    if not isinstance(valor, str):
        erros.append(f"{onde}: {campo} deve ser texto (use aspas se tiver ':' ou '#')")
        return
    if not valor.strip():
        erros.append(f"{onde}: {campo} está vazio")
    if "\n" in valor or "\r" in valor:
        erros.append(f"{onde}: {campo} deve ter uma linha só")
    if len(valor) > maximo:
        erros.append(f"{onde}: {campo} tem {len(valor)} caracteres (máximo {maximo})")
    if sem_url and RE_URL_NO_TEXTO.search(valor):
        erros.append(f"{onde}: {campo} não pode conter URL (links vêm dos dados, não do texto)")


def _lista_textos(valor, campo, onde, erros, *, max_itens, max_len, minimo=0):
    if valor is None:
        if minimo:
            erros.append(f"{onde}: campo obrigatório ausente: {campo}")
        return
    if not isinstance(valor, list) or not all(isinstance(x, str) and x.strip() for x in valor):
        erros.append(f"{onde}: {campo} deve ser lista de textos não vazios")
        return
    if len(valor) < minimo:
        erros.append(f"{onde}: {campo} precisa de pelo menos {minimo} item")
    if len(valor) > max_itens:
        erros.append(f"{onde}: {campo} tem {len(valor)} itens (máximo {max_itens})")
    for x in valor:
        if len(x) > max_len:
            erros.append(f"{onde}: {campo} contém item com {len(x)} caracteres (máximo {max_len})")
        if "\n" in x or RE_URL_NO_TEXTO.search(x):
            erros.append(f"{onde}: {campo} contém item com quebra de linha ou URL")


def validar_item(item, onde: str) -> list[str]:
    erros: list[str] = []
    if not isinstance(item, dict):
        return [f"{onde}: cada item deve ser um mapa"]
    for k in item:
        if k not in CHAVES_ITEM:
            erros.append(f"{onde}: campo desconhecido: {k} (aceitos: {', '.join(sorted(CHAVES_ITEM))})")
    repo = item.get("repo")
    if repo is None:
        erros.append(f"{onde}: campo obrigatório ausente: repo")
    elif not isinstance(repo, str) or not RE_REPO.match(repo) or repo.count("/") != 1:
        erros.append(f"{onde}: repo deve ser 'dono/nome' do GitHub, recebi {repo!r}")
    _texto(item.get("nome"), "nome", onde, erros, maximo=MAX_NOME, sem_url=True)
    _texto(item.get("pt"), "pt", onde, erros, maximo=MAX_FRASE, sem_url=True)
    _texto(item.get("en"), "en", onde, erros, maximo=MAX_FRASE, sem_url=True)
    _texto(item.get("nota"), "nota", onde, erros, maximo=MAX_NOTA, obrigatorio=False, sem_url=True)
    _lista_textos(item.get("alternativa_a"), "alternativa_a", onde, erros,
                  max_itens=MAX_ALTERNATIVAS, max_len=MAX_ALTERNATIVA)
    _lista_textos(item.get("stack"), "stack", onde, erros,
                  max_itens=MAX_STACK, max_len=MAX_ITEM_STACK, minimo=1)
    site = item.get("site")
    if site is not None and not (isinstance(site, str) and RE_SITE.match(site)):
        erros.append(f"{onde}: site deve ser uma URL http(s) sem espaços")
    for campo in ("open_core", "destaque"):
        if campo in item and not isinstance(item[campo], bool):
            erros.append(f"{onde}: {campo} deve ser true ou false")
    return erros


def validar_categoria(dados, nome_arquivo: str) -> list[str]:
    """Valida UM arquivo catalogo/<slug>.yml. Não vê duplicatas entre arquivos (ver validar_catalogo)."""
    stem = nome_arquivo.rsplit("/", 1)[-1]
    stem = stem[:-4] if stem.endswith(".yml") else stem
    onde = nome_arquivo
    if not isinstance(dados, dict):
        return [f"{onde}: o arquivo deve ser um mapa com categoria/titulo_pt/titulo_en/itens"]
    erros: list[str] = []
    for k in dados:
        if k not in CHAVES_CATEGORIA:
            erros.append(f"{onde}: campo desconhecido: {k}")
    cat = dados.get("categoria")
    if not isinstance(cat, str) or not RE_SLUG.match(cat):
        erros.append(f"{onde}: categoria deve ser um slug (minúsculas, números e hífen), recebi {cat!r}")
    elif cat != stem:
        erros.append(f"{onde}: categoria {cat!r} deve ser igual ao nome do arquivo ({stem!r})")
    _texto(dados.get("titulo_pt"), "titulo_pt", onde, erros, maximo=MAX_NOME, sem_url=True)
    _texto(dados.get("titulo_en"), "titulo_en", onde, erros, maximo=MAX_NOME, sem_url=True)
    itens = dados.get("itens")
    if not isinstance(itens, list) or not itens:
        erros.append(f"{onde}: itens deve ser uma lista com pelo menos um item")
        return erros
    for i, item in enumerate(itens, 1):
        rotulo = item.get("repo") if isinstance(item, dict) and isinstance(item.get("repo"), str) else f"item {i}"
        erros.extend(validar_item(item, f"{onde} [{rotulo}]"))
    return erros


def validar_catalogo(categorias: dict[str, dict]) -> list[str]:
    """Regras que só existem olhando o catálogo inteiro: repo único, case-insensitive."""
    erros: list[str] = []
    vistos: dict[str, str] = {}
    for slug in sorted(categorias):
        for item in categorias[slug].get("itens") or []:
            repo = item.get("repo") if isinstance(item, dict) else None
            if not isinstance(repo, str):
                continue
            chave = repo.lower()
            if chave in vistos:
                erros.append(f"catalogo/{slug}.yml [{repo}]: repo duplicado (já em catalogo/{vistos[chave]}.yml)")
            else:
                vistos[chave] = slug
    return erros


def validar_apps(dados, raiz: Path) -> list[str]:
    onde = "apps/apps.yml"
    if not isinstance(dados, dict) or not isinstance(dados.get("itens"), list) or not dados["itens"]:
        return [f"{onde}: deve ter 'itens' com a lista de produtos"]
    erros: list[str] = []
    pastas = []
    for k in dados:
        if k != "itens":
            erros.append(f"{onde}: campo desconhecido: {k}")
    for i, app in enumerate(dados["itens"], 1):
        if not isinstance(app, dict):
            erros.append(f"{onde}: item {i} deve ser um mapa")
            continue
        pasta = app.get("pasta")
        rot = f"{onde} [{pasta or i}]"
        for k in app:
            if k not in CHAVES_APP:
                erros.append(f"{rot}: campo desconhecido: {k}")
        if not isinstance(pasta, str) or not RE_SLUG.match(pasta):
            erros.append(f"{rot}: pasta deve ser um slug")
        else:
            pastas.append(pasta)
            if not (raiz / "apps" / pasta).is_dir():
                erros.append(f"{rot}: a pasta apps/{pasta} não existe")
        _texto(app.get("nome"), "nome", rot, erros, maximo=MAX_NOME)
        _texto(app.get("pt"), "pt", rot, erros, maximo=300)
        _texto(app.get("en"), "en", rot, erros, maximo=300)
        _texto(app.get("aviso_pt"), "aviso_pt", rot, erros, maximo=400, obrigatorio=False)
        _texto(app.get("aviso_en"), "aviso_en", rot, erros, maximo=400, obrigatorio=False)
        _lista_textos(app.get("stack"), "stack", rot, erros, max_itens=6, max_len=MAX_ITEM_STACK, minimo=1)
        t = app.get("testes")
        if not isinstance(t, int) or isinstance(t, bool) or t < 0:
            erros.append(f"{rot}: testes deve ser inteiro >= 0")
    if len(set(pastas)) != len(pastas):
        erros.append(f"{onde}: pasta repetida")
    apps_dir = raiz / "apps"
    if apps_dir.is_dir():
        for p in sorted(apps_dir.iterdir()):
            if p.is_dir() and not p.name.startswith(".") and p.name not in pastas:
                erros.append(f"{onde}: a pasta apps/{p.name} existe mas não está listada (contagem divergente)")
    return erros


# ---------------------------------------------------------------- carga
def carregar_categorias(raiz: Path) -> tuple[dict[str, dict], list[str]]:
    """Lê catalogo/*.yml. Devolve (slug -> dados, erros). Nunca levanta por conteúdo ruim."""
    pasta = raiz / "catalogo"
    categorias: dict[str, dict] = {}
    erros: list[str] = []
    if not pasta.is_dir():
        return categorias, ["pasta catalogo/ não existe"]
    for p in sorted(pasta.glob("*.yaml")):
        erros.append(f"catalogo/{p.name}: use a extensão .yml")
    for p in sorted(pasta.glob("*.yml")):
        try:
            dados = ler_yaml(p)
        except (yaml.YAMLError, UnicodeDecodeError) as e:
            erros.append(f"catalogo/{p.name}: YAML inválido: {str(e).splitlines()[0] if str(e) else e}")
            continue
        erros.extend(validar_categoria(dados, f"catalogo/{p.name}"))
        if isinstance(dados, dict):
            categorias[p.stem] = dados
    erros.extend(validar_catalogo(categorias))
    return categorias, erros


def carregar_apps(raiz: Path) -> tuple[list[dict], list[str]]:
    caminho = raiz / "apps" / "apps.yml"
    if not caminho.is_file():
        return [], ["apps/apps.yml não existe"]
    try:
        dados = ler_yaml(caminho)
    except yaml.YAMLError as e:
        return [], [f"apps/apps.yml: YAML inválido: {str(e).splitlines()[0]}"]
    erros = validar_apps(dados, raiz)
    return (dados.get("itens") or []) if isinstance(dados, dict) and not erros else [], erros


def todos_os_repos(categorias: dict[str, dict]) -> list[str]:
    """Repos do catálogo, na grafia do YAML, ordem determinística (slug, posição)."""
    return [i["repo"] for s in sorted(categorias) for i in categorias[s]["itens"]]


# ---------------------------------------------------------------- licença e status
def avaliar_licenca(spdx: str | None) -> str | None:
    """None se aceita; senão o motivo da recusa. NOASSERTION/Other/vazio NUNCA são aceitas."""
    s = (spdx or "").strip()
    if s in LICENCAS_ACEITAS:
        return None
    if s in LICENCAS_NAO_IDENTIFICADAS:
        return f"licença não identificada pelo GitHub ({s or 'vazia'}): sem licença clara não há direito de uso"
    if s in LICENCAS_NAO_ABERTAS:
        return LICENCAS_NAO_ABERTAS[s]
    return f"licença {s} fora da lista aceita (ver LICENSE-POLICY.md)"


def _tempo(texto: str) -> datetime:
    return datetime.fromisoformat(texto.replace("Z", "+00:00")).astimezone(timezone.utc)


def subtrair_meses(dt: datetime, meses: int) -> datetime:
    total = dt.year * 12 + (dt.month - 1) - meses
    ano, mes = divmod(total, 12)
    mes += 1
    dia = dt.day
    while True:
        try:
            return dt.replace(year=ano, month=mes, day=dia)
        except ValueError:
            dia -= 1  # 31 de agosto menos 6 meses cai em 28/29 de fevereiro


def avaliar_repo(repo_yaml: str, no: dict | None, agora: datetime) -> dict:
    """Aplica as regras de status a UM nó do GitHub (ou None = não existe/privado).

    `no` tem o formato do GraphQL: nameWithOwner, isArchived, isPrivate, pushedAt,
    stargazerCount, licenseInfo{spdxId}.
    """
    if no is None:
        return {"canonico": repo_yaml, "spdx": "", "estrelas": 0, "pushed_at": "", "arquivado": False,
                "status": "excluido", "motivo": "repositório não existe ou não é público", "aviso": ""}
    canonico = no.get("nameWithOwner") or repo_yaml
    spdx = ((no.get("licenseInfo") or {}).get("spdxId")) or ""
    pushed = no.get("pushedAt") or ""
    arquivado = bool(no.get("isArchived"))
    motivos = []
    if no.get("isPrivate"):
        motivos.append("repositório privado")
    if arquivado:
        motivos.append("repositório arquivado pelo dono (sem manutenção)")
    m_lic = avaliar_licenca(spdx)
    if m_lic:
        motivos.append(m_lic)
    if not pushed:
        motivos.append("repositório sem nenhum commit")
    status = "excluido" if motivos else "ok"
    if status == "ok" and _tempo(pushed) < subtrair_meses(agora, MESES_INATIVO):
        status = "rebaixado"
        motivos.append(f"último push em {pushed[:10]}, há mais de {MESES_INATIVO} meses")
    aviso = ""
    if canonico.lower() != repo_yaml.lower():
        aviso = f"renomeado ou transferido: no catálogo está {repo_yaml}, no GitHub é {canonico}; atualize o YAML"
    return {"canonico": canonico, "spdx": spdx, "estrelas": int(no.get("stargazerCount") or 0),
            "pushed_at": pushed, "arquivado": arquivado, "status": status,
            "motivo": "; ".join(motivos), "aviso": aviso}


# ---------------------------------------------------------------- verificado.json
def serializar_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def carregar_verificado(raiz: Path) -> tuple[dict, list[str]]:
    caminho = raiz / "catalogo" / "verificado.json"
    if not caminho.is_file():
        return {"gerado_em": None, "repos": {}}, []
    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return {"gerado_em": None, "repos": {}}, [f"catalogo/verificado.json: JSON inválido: {e}"]
    erros = []
    if not isinstance(dados, dict) or not isinstance(dados.get("repos"), dict):
        return {"gerado_em": None, "repos": {}}, ["catalogo/verificado.json: formato inesperado (esperado {gerado_em, repos})"]
    for chave, v in dados["repos"].items():
        if chave != chave.lower():
            erros.append(f"catalogo/verificado.json [{chave}]: a chave deve estar em minúsculas")
        if not isinstance(v, dict) or v.get("status") not in STATUS:
            erros.append(f"catalogo/verificado.json [{chave}]: status inválido")
    return dados, erros
