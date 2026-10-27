# Migração de legado: Delphi e Laravel para um contrato

> **English summary.** This kit helps you rewrite a legacy system without losing its business
> rules. Two sibling engines read the old system and write a deterministic, machine-checked
> *contract* of what it promises: `delphi/` reads Delphi projects (`.pas`, `.dpr`, `.dfm`, and
> even compiled `.exe`/`.dll` files) and `laravel/` reads Laravel apps (PHP) and additionally
> generates an equivalent FastAPI app. Both come with an evaluator that fails when the contract
> no longer matches the source (or, for Laravel, when the generated app answers differently).
> Python 3.12+, MIT license. Documentation below is in Brazilian Portuguese.

## O problema

Reescrever um sistema legado quase sempre perde regra de negócio: ela mora em evento de botão,
em SQL embutido, em validação espalhada, e ninguém lembra de tudo. Este kit tira essa regra da
cabeça de quem lembra e a coloca num arquivo: o **contrato**, um JSON determinístico (mesma
entrada, mesmos bytes), que o sistema novo, em qualquer linguagem, tem de cumprir. Um
**avaliador** barato refaz a leitura e reprova contrato que deixou de ser o do fonte.

| pasta | lê | escreve | avaliador |
|---|---|---|---|
| `delphi/` | projeto Delphi (`.pas`, `.dpr`, `.dfm` texto ou binário) ou executável PE (`.exe`/`.dll`/`.bpl`) | contrato JSON + relatório Markdown | `verificar` (refaz a extração e compara seção por seção); `comparar` (executável × fonte) |
| `laravel/` | app Laravel (rotas, FormRequests, migrations, models, resources, controllers) | contrato JSON **e** um app FastAPI | `verificar` (contrato × fonte) e `diferencial` (mesmas requisições nos dois apps, compara status, corpo e banco) |

## Como cada motor funciona

**Delphi** (`delphi/delphi_contrato`, só biblioteca padrão). Um leitor tolerante de Pascal e do
formato `.dfm` extrai telas, componentes, eventos, rotinas com assinatura, SQL embutido (com
tabelas e `:parametros`) e liga cada clique ao SQL que ele alcança. O que não fecha (evento sem
corpo, SQL montado com variável) vira `pendencias`. Cada item aponta arquivo e linha. Sem fonte,
lê o executável: telas e SQL saem dos recursos TPF0; o corpo das rotinas não está no `.exe`, e
para isso há uma ponte opcional para uma ferramenta externa de engenharia reversa (ver abaixo).
Também há uma versão que roda no navegador via Pyodide (`delphi/navegador/`).

**Laravel** (`laravel/laravel_fastapi`). O PHP é lido pela árvore do tree-sitter, nunca por regex
nem executando PHP. O contrato traz rotas, validações, tabelas das migrations, models, resources e
o corpo dos métodos num IR pequeno. O gerador produz, só a partir do contrato, um projeto FastAPI
(rotas, Pydantic, SQLAlchemy, código traduzido) sobre um runtime compatível (`laravel_compat`). O
que ele não consegue traduzir vira `php.pendencia(...)` e a rota responde **501**, em vez de
inventar comportamento. O avaliador diferencial sobe os dois apps com cópias idênticas do mesmo
banco, manda os mesmos passos a ambos e compara status, corpo e estado do banco.

## Como rodar

Requisitos: Python 3.12 ou mais novo. (Os testes deste kit foram rodados em 3.13.)

    python3 -m venv .venv && . .venv/bin/activate

**Delphi** (sem dependências; `pytest` só para testar):

    cd delphi
    python -m delphi_contrato extrair tests/fixtures/cadastro -o contrato.json
    python -m delphi_contrato relatorio contrato.json -o contrato.md
    python -m delphi_contrato verificar contrato.json tests/fixtures/cadastro   # sai 1 se divergir
    python -m delphi_contrato extrair Sistema.exe -o contrato.json              # sem fonte

**Laravel** (a partir da pasta `laravel/`):

    pip install -r requirements.txt
    python -m laravel_fastapi extrair tests/fixtures/mini -o contrato.json
    python -m laravel_fastapi gerar contrato.json -o gerado/
    # app gerado (precisa das tabelas; aqui criadas pelo SQLAlchemy gerado):
    cd gerado && export DATABASE_URL=sqlite:///banco.sqlite
    python -c "import sqlalchemy as sa, modelos; modelos.metadata.create_all(sa.create_engine('sqlite:///banco.sqlite'))"
    uvicorn main:app

Com `TestClient` (o que foi feito na validação): importar `main.app` dentro de `gerado/` e chamar
`GET /api/posts`.

## Testes

    cd delphi   && pip install -r requirements-dev.txt && pytest -q tests
    cd laravel  && pip install -r requirements.txt     && pytest -q tests

Medido em 2026-10-27, Python 3.13, venv limpo: `delphi` 52 passaram; `laravel` 23 passaram.
Os testes do navegador (`delphi/tests/test_navegador.py`) precisam de Node, Playwright com
Chromium e do pacote Pyodide (baixado do npm); sem isso eles se marcam como `skip`.

## Casos reais (não incluídos)

Este repositório **não** traz binários nem código de terceiros. Os casos usados no desenvolvimento
são reproduzíveis, mas você baixa por conta própria:

- **Laravel / RealWorld.** App de terceiros (MIT): `git clone https://github.com/f1amy/laravel-realworld-example-app`
  e `git checkout c14fb8370b71a42a3a74b8ea936a1f96b2af9d69`. Depois
  `python laravel/casos/realworld.py contrato --fonte <checkout> --saida <dir>`. Cenário, semente e o
  script de uma rodada completa (containers Docker) estão em `laravel/casos/realworld/`.
- **Delphi / executável real.** Qualquer `.exe` Delphi seu serve para `extrair`/`comparar`. O caso
  de desenvolvimento foi um programa aberto de terceiros; seus binários, fontes e pseudo-código
  foram deixados de fora de propósito (licença).
- **REA (engenharia reversa, opcional).** `python -m delphi_contrato rea Sistema.exe [--aplicar]` monta
  (e com `--aplicar`, roda) comandos de uma ferramenta externa via `npx` com versão fixada em
  `delphi/delphi_contrato/rea.py`. Precisa de Node 22+ e, para binário nativo, Ghidra (Java). Sem
  `--aplicar` só mostra o plano. Não é dependência do motor.

## Limites honestos

- **Delphi.** O leitor de Pascal é tolerante, não é compilador: `{$IFDEF}` não é avaliado (os dois
  ramos entram); genéricos, `class helper` e `asm` não são interpretados. Chamada entre rotinas é
  achada por nome (pode haver chamada falsa). SQL montado em tempo de execução vira pendência. Do
  executável só se lê PE do Windows não comprimido, e **o corpo das rotinas não vem do `.exe`**. O
  caminho do navegador e o do executável foram testados num PE sintético e na fixture; num `.exe` real
  a cobertura é sua para medir.
- **Laravel.** O runtime cobre o que um app Laravel idiomático usa (Eloquent básico,
  belongsTo/hasMany/belongsToMany, FormRequest, Resource, Auth, Gate, throttle). App grande (sessão,
  `url()`, filesystem, SQL cru, `paginate()`) gera muita pendência e rotas 501. A cobertura estática é
  estimativa por nome. O diferencial só prova o que o cenário exercita, com uma requisição por vez e
  SQLite nos dois lados. Mensagens de framework estão calibradas no Laravel 9.17.
- **O que foi e não foi re-medido aqui (2026-10-27).** Foi: testes (acima), exemplo ponta a ponta de
  cada motor, e a extração estática do RealWorld no commit fixado (19 rotas, 10 tabelas/54 colunas, 19 de
  19 rotas cobertas pelo gerador, 1 pendência). **Não foi**: o diferencial do RealWorld (o autor do kit
  mediu 19 de 19 endpoints iguais e 81 de 81 passos em outro ambiente, mas isso precisa de PHP +
  Composer + Docker; refaça com `rodada.sh` antes de citar o número), a cobertura do Chromium e do
  Pyodide em outras máquinas, e Postgres/MySQL.
- É ponto de partida para um projeto de migração, não um conversor de um clique: pendências são
  trabalho humano, e o app gerado deve ser revisado.

## Licença

MIT (ver LICENSE na raiz).
