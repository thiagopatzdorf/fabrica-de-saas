# AGENTS.md

Guia para agentes de IA (e pessoas apressadas). PT primeiro; EN logo abaixo de cada bloco curto.

## O que é este repositório / What this repo is

Um catálogo verificado de SaaS open source (`catalogo/`) e 9 produtos próprios em MIT (`apps/`).
A licença, as estrelas e a atividade de cada projeto vêm da API do GitHub, nunca de memória ou de texto.
/ A verified catalog of open source SaaS (`catalogo/`) plus 9 MIT products of our own (`apps/`). License, stars
and activity come from the GitHub API, never from memory.

## Regra de ouro / Golden rule

**Nunca edite arquivos gerados.** Eles são reescritos por `scripts/gerar.py` e o CI falha se divergirem.
Edite só a fonte: `catalogo/<categoria>.yml` ou `apps/apps.yml`. / **Never edit generated files.**

| Arquivo | Tipo | Edita? |
|---|---|---|
| `catalogo/<categoria>.yml` | fonte (um por categoria; nome do arquivo = slug) | sim |
| `apps/apps.yml` | fonte (os produtos próprios) | sim |
| `catalogo/verificado.json` | fatos da API, gravado por `scripts/verificar.py` | não |
| `README.md`, `catalogo/<categoria>.md`, `catalogo.json`, `catalogo.csv`, `llms.txt`, `llms-full.txt`, `docs/estatisticas.md`, `schema/saas.schema.json` | gerados | não |
| `scripts/catalogo.py` | regras (limites, licenças aceitas, prazo de 18 meses) | com teste |
| `scripts/verificar.py`, `scripts/gerar.py`, `tests/` | ferramentas e testes | com teste |

## Consultar os dados / Querying

O ponto de entrada é `catalogo.json`: `{"meta": {...}, "itens": [...]}`. Cada item tem `categoria`, `repo`,
`url`, `nome`, `alternativa_a`, `pt`, `en`, `stack`, `site`, `open_core`, `nota`, `destaque`, `licenca`,
`estrelas`, `ultimo_push`, `status` (`ok` ou `rebaixado`; excluídos não aparecem), `motivo`, `aviso`.
Esquema: `schema/saas.schema.json`.

```bash
# alternativas ao Salesforce, mais estreladas primeiro
jq -r '.itens | map(select(.alternativa_a | index("Salesforce"))) | sort_by(-.estrelas)[] | "\(.estrelas)\t\(.repo)\t\(.licenca)\t\(.en)"' catalogo.json

# só permissivas, sem open core, ativas
jq -r '.itens[] | select(.status=="ok" and (.open_core|not) and (.licenca|IN("MIT","Apache-2.0","BSD-3-Clause","ISC"))) | .repo' catalogo.json

# categorias e contagens
jq -r '.meta.categorias[] | "\(.slug)\t\(.ativos)"' catalogo.json
```

```python
import json
d = json.load(open("catalogo.json", encoding="utf-8"))
alvo = "jira"
achados = [i for i in d["itens"] if alvo in (a.lower() for a in i["alternativa_a"])]
for i in sorted(achados, key=lambda i: -i["estrelas"]):
    print(i["repo"], i["licenca"], i["estrelas"], i["en"])
```

Sem `jq`/Python: `llms-full.txt` tem uma linha por projeto (`nome | repo | licença | estrelas | substitui | en | pt`)
e `catalogo.csv` tem as mesmas colunas em CSV.

## Propor uma entrada / Proposing an entry

1. Pesquise o projeto de verdade (repositório, licença, atividade) e confira que ele ainda não está no catálogo:
   `grep -ril 'dono/nome' catalogo/*.yml`.
2. Acrescente o item ao `catalogo/<categoria>.yml` certo, neste formato (obrigatórios: `repo`, `nome`, `pt`, `en`, `stack`):

```yaml
  - repo: dono/nome                 # único no catálogo inteiro, sem diferenciar maiúsculas
    nome: Nome
    alternativa_a: [Produto Proprietário]
    pt: "Uma frase sua em português, até 140 caracteres, sem URL."
    en: "One sentence of yours in English, up to 140 characters, no URL."
    stack: [Linguagem, Banco]       # de 1 a 4
    site: https://exemplo.com       # opcional
    open_core: false                # opcional
    nota: "opcional, curta"         # opcional
    destaque: false                 # opcional; só a curadoria marca true
```

3. **Não** escreva licença, estrelas nem datas, e **não** copie a descrição do projeto: escreva a sua.
4. Abra PR pequeno, uma categoria por vez. Commit em português: `feat(catalogo): adiciona X em crm-vendas`.

## Verificar localmente / Verify locally

Comandos exatos (Python 3.12+, só precisa de PyYAML):

```bash
python3 -m pip install pyyaml
python3 -m unittest discover -s tests          # 100% offline
python3 scripts/verificar.py --so-validar      # esquema do catálogo, offline
python3 scripts/gerar.py --conferir            # exit 1 se algum gerado estiver velho
```

Com rede (consulta o GitHub em lotes de 40 repos por GraphQL e grava `catalogo/verificado.json`):

```bash
export GITHUB_TOKEN=...                        # nunca cole o token em arquivo, issue ou log
python3 scripts/verificar.py                   # exit 0 mesmo com excluídos: o relatório lista cada um
python3 scripts/gerar.py                       # regenera README, páginas, JSON, CSV, llms*.txt
python3 scripts/gerar.py --conferir
```

Códigos de saída: `0` ok; `1` `--conferir` achou gerado fora de sincronia (ou `--estrito` achou repo novo que não passa);
`2` dados inválidos, sem token, ou falha na API. Opções úteis de `verificar.py`: `--fixture f.json` (respostas da API
de um arquivo, sem rede), `--sem-gravar`, `--estrito`, `--agora ISO`.

## Status e licenças / Status and licenses

- `excluido`: repositório inexistente/privado, arquivado, sem commit, ou licença fora da lista (`LICENSE-POLICY.md`).
  Some de todas as páginas e saídas.
- `rebaixado`: último push há mais de 18 meses. Aparece marcado como parado.
- `ok`: o resto. Um item novo no YAML só aparece depois de `verificar.py` (a rotina semanal faz isso).
- Repo renomeado/transferido: o `verificado.json` guarda o `canonico` e um `aviso`; corrija o `repo` no YAML.

## Limites que você deve respeitar / Limits

- Segredo nunca vai para arquivo, log ou saída. Para conferir que o token existe, imprima o tamanho.
- Não invente: se não conseguiu confirmar licença, estrelas ou existência de um projeto, não o inclua.
- Não mude regras (`scripts/catalogo.py`) sem teste que falha antes da mudança.
