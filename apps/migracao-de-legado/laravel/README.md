# laravel: Laravel → contrato → FastAPI

Lê um app Laravel (PHP) com tree-sitter, escreve o contrato da API em JSON determinístico (rotas,
validações, tabelas das migrations, models, resources, voláteis, pendências), gera dele um app
FastAPI e mede com um avaliador diferencial.

    pip install -r requirements.txt
    python -m laravel_fastapi extrair <app Laravel> -o contrato.json
    python -m laravel_fastapi verificar contrato.json <app> [--estrito]
    python -m laravel_fastapi gerar contrato.json -o gerado/
    python -m laravel_fastapi diferencial --cenario c.json --contrato contrato.json \
        --laravel URL,banco.sqlite --fastapi URL,banco.sqlite -o resultado.json

O projeto gerado (`rotas.py`, `validacoes.py`, `modelos.py`, `app_traduzido.py`, `config_app.py`,
`dados.py`, `cobertura.json` e a cópia do runtime `laravel_compat`) não depende deste repositório.
Trecho sem tradução vira `php.pendencia(...)` e a rota responde 501.

- `tests/fixtures/mini/`: app Laravel mínimo de exemplo (nosso), com uma rota closure que fica pendente de propósito.
- `casos/realworld.py` e `casos/realworld/`: cenário, semente e roteiro (`rodada.sh`, Docker) para o app
  RealWorld de terceiros. O app **não** está aqui; para obtê-lo e rodar, ver README da raiz.
  Inversa da rodada: `docker rm -f lf-laravel lf-fastapi`.

Receita das imagens (PHP 8.1 + composer, app no commit fixado; `lf-fastapi:1` = `python:3.12-slim` + `requirements.txt`):

    FROM php:8.1-cli
    RUN apt-get update && apt-get install -y --no-install-recommends git unzip libzip-dev sqlite3 && docker-php-ext-install zip
    COPY --from=composer:2.8 /usr/bin/composer /usr/bin/composer
    RUN git clone https://github.com/f1amy/laravel-realworld-example-app /app && cd /app \
        && git checkout c14fb8370b71a42a3a74b8ea936a1f96b2af9d69 && composer install --no-dev --no-interaction

Testes: `pytest -q tests` (23 passam). Limites: ver README da raiz.
