# delphi: Delphi → contrato

Lê um projeto Delphi (`.pas`, `.dpr`, `.dfm` em texto ou TPF0) ou um executável PE e escreve o
contrato JSON do que o sistema promete: telas, componentes, eventos, rotinas com assinatura, SQL
com tabelas e parâmetros, e cada clique ligado ao SQL que alcança. Só biblioteca padrão (Python 3.12+).

    python -m delphi_contrato extrair <projeto|projeto.dpr|Sistema.exe> -o contrato.json
    python -m delphi_contrato relatorio contrato.json -o contrato.md
    python -m delphi_contrato verificar contrato.json <projeto> [--estrito]   # sai 1 se divergir
    python -m delphi_contrato comparar Sistema.exe <projeto>.dpr              # executável × fonte
    python -m delphi_contrato web Sistema.exe -o telas.json                   # telas para o renderizador web/
    python -m delphi_contrato rea Sistema.exe [--aplicar]                     # ponte opcional (REA, via npx)

Seções do contrato: `formularios`, `operacoes`, `unidades`, `classes`, `sql`/`tabelas`, `pendencias`,
`cobertura`. Mesma entrada, mesmos bytes (sem data nem caminho absoluto).

- `tests/fixtures/cadastro/`: projeto de exemplo (um botão ligado a handler sem corpo e um SQL
  montado com variável, de propósito) e o contrato gerado (`cadastro.contrato.json`/`.md`).
- `tests/sintetico.py`: monta um PE sintético com os formulários do exemplo.
- `navegador/`: o mesmo pacote rodando no Pyodide, em página estática
  (`python navegador/montar.py <destino>`; `python navegador/servir.py <destino>`).
  Baixa o Pyodide do npm e confere o sha256 contra `navegador/pyodide.json`.
- `web/`: renderizador de telas Delphi em DOM a partir do JSON do comando `web`.

Testes: `pip install -r requirements-dev.txt && pytest -q tests` (52 passam; os do navegador pedem
Node, Playwright/Chromium e rede para o Pyodide). Limites: ver README da raiz.
