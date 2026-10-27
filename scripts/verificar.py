#!/usr/bin/env python3
"""Valida o catálogo e confere cada repo no GitHub (licença, arquivado, último push).

Uso:
  python3 scripts/verificar.py --so-validar          # sem rede: só o esquema
  GITHUB_TOKEN=... python3 scripts/verificar.py      # consulta o GitHub e grava catalogo/verificado.json
  python3 scripts/verificar.py --fixture f.json      # respostas da API vindas de um arquivo (testes)

Fatos (licença, estrelas, último push, arquivado) NUNCA ficam no YAML: vêm só daqui.
O token vem do ambiente e nunca é impresso.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalogo as cat  # noqa: E402

RAIZ_PADRAO = Path(__file__).resolve().parent.parent
API = "https://api.github.com/graphql"
TAMANHO_LOTE = 40
MAX_TENTATIVAS = 5
TETO_ESPERA = 900  # nunca dorme mais que 15 min numa espera só

FRAGMENTO = ("fragment F on Repository { nameWithOwner isArchived isPrivate pushedAt "
             "stargazerCount licenseInfo { spdxId } }")


class ErroVerificacao(Exception):
    pass


def montar_consulta(lote: list[str]) -> str:
    """Um alias por repo (r0, r1...). O formato de `repo` já foi validado (só [A-Za-z0-9_.-])."""
    partes = []
    for i, repo in enumerate(lote):
        dono, nome = repo.split("/")
        partes.append(f'r{i}: repository(owner: "{dono}", name: "{nome}") {{ ...F }}')
    return "query { " + " ".join(partes) + " rateLimit { remaining resetAt } } " + FRAGMENTO


def transporte_http(url: str, corpo: bytes, cabecalhos: dict) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=corpo, headers=cabecalhos, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 - URL fixa https
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, {}, str(e).encode()


class ClienteGitHub:
    """GraphQL em lotes, com espera e nova tentativa em rate limit e em erro transitório."""

    def __init__(self, token: str, transporte=transporte_http, dormir=time.sleep, agora=time.time):
        self._token = token
        self._transporte = transporte
        self._dormir = dormir
        self._agora = agora
        self.esperas: list[float] = []

    def _limpar(self, texto: str) -> str:
        return texto.replace(self._token, "***")[:300]

    def _espera_de(self, cab: dict, tentativa: int) -> float:
        if "retry-after" in cab:
            try:
                return min(float(cab["retry-after"]) + 1, TETO_ESPERA)
            except ValueError:
                pass
        if cab.get("x-ratelimit-remaining") == "0" and "x-ratelimit-reset" in cab:
            try:
                return min(max(float(cab["x-ratelimit-reset"]) - self._agora(), 0) + 2, TETO_ESPERA)
            except ValueError:
                pass
        return min(2.0 ** (tentativa + 1) * 5, 120)

    def _dormir_log(self, seg: float, motivo: str):
        self.esperas.append(seg)
        print(f"  aguardando {seg:.0f}s ({motivo})", file=sys.stderr)
        self._dormir(seg)

    def _pedir(self, lote: list[str]) -> dict:
        corpo = json.dumps({"query": montar_consulta(lote)}).encode()
        cab = {"Authorization": f"bearer {self._token}", "Content-Type": "application/json",
               "User-Agent": "fabrica-de-saas-verificar"}
        ultimo = ""
        for tentativa in range(MAX_TENTATIVAS):
            status, rcab, rcorpo = self._transporte(API, corpo, cab)
            texto = rcorpo.decode("utf-8", "replace")
            if status == 401:
                raise ErroVerificacao("GitHub recusou o token (401). Confira GITHUB_TOKEN.")
            limite = status in (403, 429) and (
                "rate limit" in texto.lower() or "retry-after" in rcab or rcab.get("x-ratelimit-remaining") == "0")
            if limite:
                self._dormir_log(self._espera_de(rcab, tentativa), "rate limit")
                ultimo = f"HTTP {status} rate limit"
                continue
            if status == 0 or status >= 500:
                ultimo = f"HTTP {status}: {self._limpar(texto)}"
                if tentativa >= 1 and len(lote) > 1:
                    raise _LoteGrande(ultimo)
                self._dormir_log(self._espera_de(rcab, tentativa), "erro transitório")
                continue
            if status != 200:
                raise ErroVerificacao(f"GitHub respondeu HTTP {status}: {self._limpar(texto)}")
            try:
                resp = json.loads(texto)
            except json.JSONDecodeError:
                raise ErroVerificacao("resposta do GitHub não é JSON") from None
            erros = resp.get("errors") or []
            if any(e.get("type") == "RATE_LIMITED" for e in erros):
                reset = ((resp.get("data") or {}).get("rateLimit") or {}).get("resetAt")
                seg = 60.0
                if reset:
                    seg = min(max((cat._tempo(reset) - datetime.now(timezone.utc)).total_seconds(), 0) + 2, TETO_ESPERA)
                self._dormir_log(seg, "rate limit GraphQL")
                ultimo = "RATE_LIMITED"
                continue
            return resp
        raise ErroVerificacao(f"GitHub não respondeu após {MAX_TENTATIVAS} tentativas ({ultimo})")

    def buscar(self, repos: list[str]) -> dict[str, dict | None]:
        """repo (minúsculo) -> nó do GitHub, ou None se não existe/privado."""
        saida: dict[str, dict | None] = {}
        for i in range(0, len(repos), TAMANHO_LOTE):
            saida.update(self._lote(repos[i:i + TAMANHO_LOTE]))
        return saida

    def _lote(self, lote: list[str]) -> dict[str, dict | None]:
        try:
            resp = self._pedir(lote)
        except _LoteGrande:
            meio = len(lote) // 2
            return {**self._lote(lote[:meio]), **self._lote(lote[meio:])}
        dados = resp.get("data") or {}
        nao_achou = set()
        for e in resp.get("errors") or []:
            caminho = e.get("path") or []
            if e.get("type") == "NOT_FOUND" and caminho:
                nao_achou.add(caminho[0])
            else:
                raise ErroVerificacao(
                    f"erro do GitHub ({e.get('type', '?')}): {self._limpar(str(e.get('message', '')))}")
        saida = {}
        for i, repo in enumerate(lote):
            alias = f"r{i}"
            no = dados.get(alias)
            if no is None and alias not in nao_achou:
                raise ErroVerificacao(f"resposta sem dados para {repo} e sem NOT_FOUND: abortando")
            saida[repo.lower()] = no
        return saida


class _LoteGrande(Exception):
    pass


class ClienteFixture:
    """Respostas da API num JSON {repo_minusculo: nó|null}. A chave '_agora' é ignorada aqui."""

    def __init__(self, caminho: Path):
        self.dados = {k.lower(): v for k, v in json.loads(Path(caminho).read_text(encoding="utf-8")).items()
                      if not k.startswith("_")}

    def buscar(self, repos):
        faltando = [r for r in repos if r.lower() not in self.dados]
        if faltando:
            raise ErroVerificacao(f"fixture sem resposta para: {', '.join(faltando)}")
        return {r.lower(): self.dados[r.lower()] for r in repos}


# ---------------------------------------------------------------- núcleo (testável sem rede)
def verificar_repos(repos: list[str], cliente, agora: datetime) -> dict[str, dict]:
    unicos = sorted({r.lower(): r for r in repos}.values(), key=str.lower)
    nos = cliente.buscar(unicos)
    return {r.lower(): cat.avaliar_repo(r, nos[r.lower()], agora) for r in unicos}


def montar_verificado(novos: dict[str, dict], anterior: dict, agora: datetime) -> dict:
    """Mantém o gerado_em antigo quando nada mudou: PR semanal só aparece com mudança real."""
    if anterior.get("repos") == novos and anterior.get("gerado_em"):
        return {"gerado_em": anterior["gerado_em"], "repos": novos}
    return {"gerado_em": agora.strftime("%Y-%m-%dT%H:%M:%SZ"), "repos": novos}


def relatorio(novos: dict[str, dict]) -> list[str]:
    linhas = []
    cont = {s: 0 for s in cat.STATUS}
    for v in novos.values():
        cont[v["status"]] += 1
    linhas.append(f"verificados: {len(novos)}  ok: {cont['ok']}  rebaixados: {cont['rebaixado']}  excluídos: {cont['excluido']}")
    for chave in sorted(novos):
        v = novos[chave]
        if v["status"] == "excluido":
            linhas.append(f"  EXCLUÍDO  {chave}: {v['motivo']}")
    for chave in sorted(novos):
        v = novos[chave]
        if v["status"] == "rebaixado":
            linhas.append(f"  rebaixado {chave}: {v['motivo']}")
    for chave in sorted(novos):
        if novos[chave]["aviso"]:
            linhas.append(f"  AVISO     {chave}: {novos[chave]['aviso']}")
    return linhas


def principal(argv=None, *, cliente=None, ambiente=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", type=Path, default=RAIZ_PADRAO, help="raiz do repo (padrão: a deste script)")
    ap.add_argument("--so-validar", action="store_true", help="só valida o esquema, sem rede")
    ap.add_argument("--fixture", type=Path, help="JSON com as respostas da API (sem rede, sem token)")
    ap.add_argument("--agora", help="data de referência ISO (testes); padrão: agora")
    ap.add_argument("--sem-gravar", action="store_true", help="consulta e relata, não escreve verificado.json")
    ap.add_argument("--estrito", action="store_true",
                    help="exit 1 se algum repo NOVO (ainda não excluído no verificado.json) for excluído; "
                         "exclusões já registradas não travam PR alheio")
    a = ap.parse_args(argv)
    env = os.environ if ambiente is None else ambiente

    categorias, erros = cat.carregar_categorias(a.raiz)
    _, erros_apps = cat.carregar_apps(a.raiz)
    erros += erros_apps
    if erros:
        print(f"{len(erros)} erro(s) no catálogo:", file=sys.stderr)
        for e in erros:
            print(f"  {e}", file=sys.stderr)
        return 2
    repos = cat.todos_os_repos(categorias)
    if a.so_validar:
        print(f"catálogo válido: {len(categorias)} categorias, {len(repos)} itens")
        return 0

    if cliente is None:
        if a.fixture:
            cliente = ClienteFixture(a.fixture)
        else:
            token = env.get("GITHUB_TOKEN", "")
            if not token:
                print("GITHUB_TOKEN não está no ambiente. Exporte um token (sem escopos serve para repos públicos) "
                      "ou use --so-validar / --fixture. O token nunca é impresso.", file=sys.stderr)
                return 2
            cliente = ClienteGitHub(token)
    if a.agora:
        agora = cat._tempo(a.agora)
    elif a.fixture and "_agora" in json.loads(a.fixture.read_text(encoding="utf-8")):
        agora = cat._tempo(json.loads(a.fixture.read_text(encoding="utf-8"))["_agora"])
    else:
        agora = datetime.now(timezone.utc)

    try:
        novos = verificar_repos(repos, cliente, agora)
    except ErroVerificacao as e:
        print(f"falha ao consultar o GitHub: {e}", file=sys.stderr)
        return 2
    anterior, _ = cat.carregar_verificado(a.raiz)
    saida = montar_verificado(novos, anterior, agora)
    for linha in relatorio(novos):
        print(linha)
    if not a.sem_gravar:
        destino = a.raiz / "catalogo" / "verificado.json"
        tmp = destino.with_suffix(".json.tmp")
        tmp.write_text(cat.serializar_json(saida), encoding="utf-8")
        tmp.replace(destino)  # troca atômica: nunca fica meio escrito
        print(f"gravado {destino.relative_to(a.raiz)}")
    if a.estrito:
        novos_excluidos = sorted(k for k, v in novos.items() if v["status"] == "excluido"
                                 and anterior.get("repos", {}).get(k, {}).get("status") != "excluido")
        if novos_excluidos:
            print(f"--estrito: {len(novos_excluidos)} repo(s) novo(s) não passam na verificação: "
                  f"{', '.join(novos_excluidos)}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(principal())
