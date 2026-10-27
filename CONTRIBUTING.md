# Como contribuir

Para adicionar um SaaS open source ao catálogo você edita **um arquivo YAML**. O CI valida o formato e
confere a licença no GitHub; você não precisa rodar nada além (mas pode, veja o fim).

## Adicionar um SaaS

1. Escolha a categoria em `catalogo/` (um arquivo por categoria; o nome do arquivo é o slug).
   Se nenhuma serve, abra uma issue antes de criar categoria nova.
2. Acrescente um item em `itens:`:

```yaml
  - repo: twentyhq/twenty          # dono/nome no GitHub, único no catálogo inteiro
    nome: Twenty
    alternativa_a: [Salesforce, HubSpot]   # SaaS proprietários que ele substitui
    pt: "Uma frase em português, sua, até 140 caracteres."
    en: "One sentence in English, yours, up to 140 characters."
    stack: [TypeScript, React, PostgreSQL] # de 1 a 4
    site: https://twenty.com       # opcional
    open_core: false               # opcional; true se parte relevante é proprietária
    nota: "texto curto opcional"   # opcional
    destaque: false                # opcional; reservado para a curadoria
```

3. Abra o PR. Não escreva licença, estrelas nem data: esses fatos vêm da API do GitHub
   (`catalogo/verificado.json`) e **não** moram no YAML. Também não edite arquivos gerados
   (`README.md`, `catalogo/*.md`, `catalogo.json`, `catalogo.csv`, `llms*.txt`, `docs/estatisticas.md`):
   uma rotina semanal os atualiza.

Regras de texto: `pt` e `en` são frases **suas** (não copie a descrição do projeto), com até 140 caracteres,
uma linha, **sem URL**. Use aspas se tiver `:` ou `#`.

## O que será recusado

- Licença fora da [lista aceita](LICENSE-POLICY.md): BSL/BUSL, SSPL, Elastic License, Commons Clause,
  "fair-code", licença própria, ou repositório sem licença identificada pelo GitHub.
- Repositório arquivado, inexistente ou privado.
- Repositório duplicado (a comparação ignora maiúsculas).
- Texto copiado do projeto ou de outras listas, ou com link no corpo da frase.
- Autopromoção sem uso real; a lista é de projetos, não de anúncios.
- Projeto sem push há mais de 18 meses entra **rebaixado** (marcado como parado), não é recusado.

## Reportar problema

Licença errada, projeto morto, link quebrado: abra uma issue com o modelo "Reportar problema".

## Verificar localmente (opcional)

```bash
python3 -m pip install pyyaml
python3 -m unittest discover -s tests          # testes, sem rede
python3 scripts/verificar.py --so-validar      # formato do catálogo, sem rede
GITHUB_TOKEN=... python3 scripts/verificar.py  # confere no GitHub e grava catalogo/verificado.json
python3 scripts/gerar.py                       # regenera os arquivos gerados
python3 scripts/gerar.py --conferir            # falha se algum gerado estiver velho
```

---

## English

Adding an open source SaaS means editing **one YAML file** under `catalogo/` (one file per category, the
file name is the category slug). CI validates the format and checks the license on GitHub.

Add an item under `itens:` using the format shown above: `repo` (`owner/name`, unique in the whole catalog,
case-insensitive), `nome`, `alternativa_a` (proprietary SaaS it replaces), `pt` and `en` (one sentence each,
yours, up to 140 characters, no URLs), `stack` (1 to 4). Optional: `site`, `open_core`, `nota`, `destaque`.

Do not write license, stars or dates: those facts come from the GitHub API into `catalogo/verificado.json`.
Do not edit generated files; a weekly job refreshes them.

Rejected: licenses outside the [accepted list](LICENSE-POLICY.md) (BSL, SSPL, Elastic, Commons Clause,
fair-code, custom or unidentified licenses), archived/missing/private repos, duplicates, copied text,
URLs inside the sentences. A project with no push in over 18 months is listed as *stale*, not rejected.

Check locally with the commands above (`python3 scripts/verificar.py --so-validar` needs no network).
