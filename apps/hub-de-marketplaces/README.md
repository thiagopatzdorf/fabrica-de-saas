# Hub de Marketplaces

**English:** a multi-channel e-commerce hub template. One product catalog, price rules,
a single stock balance, listings, orders, invoices and shipping across several marketplaces
(Mercado Livre, Shopee, Amazon, Magalu, own store). Built with TanStack Start, React,
better-auth, Kysely and Postgres (PGlite in dev). It is multi-tenant: every user gets their
own organization and every query is scoped to it. **The marketplace adapters are simulated**
(random latency and random failures), and so are invoices and shipping labels: this is a
ready-made base to build on, and wiring the real marketplace APIs is the next step
(see [docs/adaptadores.md](docs/adaptadores.md)).

---

> ## Leia antes: o que é e o que não é
>
> **Template / base pronta. Os adaptadores de canal são SIMULADOS.**
> Mercado Livre, Shopee, Amazon e Magalu não são chamados de verdade: cada operação espera
> um tempo aleatório e falha em 5% das vezes, de propósito. Nota fiscal e etiqueta também
> são simuladas. O que é real e funciona: o cadastro de produtos, o motor de preço, o saldo
> de estoque com reserva, os pedidos e seus estados, o isolamento entre organizações, o login
> e o banco. **Integrar os canais reais é o próximo passo**, e o contrato que o código já usa
> está descrito em [docs/adaptadores.md](docs/adaptadores.md), junto com os pontos que ainda
> faltam (credenciais por conta, coleta real de pedidos, webhooks, nota e etiqueta reais).

## Recursos

- **Catálogo mestre:** produto simples, variação, kit (com componentes) e pai; SKU, EAN, NCM,
  dimensões, fotos, apelidos de SKU por canal; importação por CSV (modelo na própria tela).
- **Mapeamentos:** categoria interna para categoria de cada canal, com os atributos obrigatórios.
- **Anúncios:** publicar o mesmo produto em vários canais/contas, em lote; pausa e erro por anúncio.
- **Preço:** regras por canal (comissão, imposto, margem, frete, piso, arredondamento em ,90,
  promoção com janela de datas) e sugestão de preço que cobre todos os custos.
- **Estoque único:** saldo físico menos reservado, estoque de segurança que pausa os anúncios
  sozinho e reativa quando volta, ajustes em fila.
- **Pedidos:** caixa de entrada, pagar, cancelar (libera a reserva), entregar, devolver (devolve
  ao estoque).
- **Expedição, notas e pós-venda:** lote de despacho com código de rastreio, notas (simuladas),
  perguntas dos compradores com respostas rápidas e automáticas.
- **Conectores:** contas por canal, sonda de conexão e log de sincronização.
- **Multi-tenant:** cada usuário tem uma organização (`org_id`); toda consulta é filtrada por ela.

## Stack

TanStack Start (React 19, Vite, Nitro) · TanStack Router/Query · Tailwind CSS 4 · better-auth
(e-mail e senha) · Kysely/pg · Postgres em produção, PGlite (Postgres em WASM) em desenvolvimento ·
zod · Vitest.

## Como rodar

Requer Node 22 ou superior.

```bash
npm install
npm run dev        # http://localhost:8080
```

Abra `http://localhost:8080`, clique em **Criar acesso** e entre. A primeira abertura de cada
organização traz dados fictícios da "Oficina Norte" (24 itens, pedidos, perguntas) para o app
não nascer vazio. Para começar vazio: `HUB_SEED_DEMO=false`.

Sem configurar nada, o banco é PGlite **em memória**: os dados somem quando o servidor reinicia.
Para gravar em disco, defina `PGLITE_DATA_DIR=.pglite`.

### Produção

```bash
cp exemplo.env .env     # preencha DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
npm ci
npm run build
npm run db:migrate       # aplica as migrations no Postgres de DATABASE_URL
npm start                # node .output/server/index.mjs (porta 3000; mude com PORT)
```

Em produção o app **se recusa a subir sem `BETTER_AUTH_SECRET`** (32 caracteres ou mais).
`BETTER_AUTH_URL` precisa ser a URL pública exata: a checagem de origem do login a usa, e se ela
não bater o login responde `Invalid origin`. Atrás de um proxy reverso, repasse o IP do cliente
(o limitador de tentativas do better-auth o usa). Qualquer plataforma que rode Node serve (VM,
Docker, Railway, Fly etc.); o resultado do build é um servidor Node autônomo em `.output/`.

## Banco

- **Desenvolvimento:** PGlite, aplica sozinho os arquivos de `migrations/` ao subir.
- **Produção:** Postgres (qualquer versão atual) via `DATABASE_URL`; `npm run db:migrate` aplica as
  migrations pendentes, cada uma numa transação, registradas na tabela `_migrations`.
- `migrations/0001_auth.sql` é o esquema do better-auth; `0002_hub.sql` é o esquema do hub.
  Mudança de esquema vai em arquivo **novo** (`0003_*.sql`), nunca editando os aplicados.

## Autenticação e variáveis

Login por e-mail e senha (better-auth), sessão por cookie. Todas as variáveis estão em
[`exemplo.env`](exemplo.env); nenhuma é obrigatória em desenvolvimento.

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Postgres de verdade. Sem ela, PGlite. |
| `PGLITE_DATA_DIR` | grava o PGlite em disco |
| `BETTER_AUTH_SECRET` | assinatura das sessões; obrigatória em produção |
| `BETTER_AUTH_URL` | URL pública do app (padrão `http://localhost:8080`) |
| `TRUSTED_ORIGINS` | origens extras aceitas no login, separadas por vírgula |
| `HUB_DISABLE_SIGNUP` | `true` fecha o cadastro aberto |
| `HUB_SEED_DEMO` | `false` cria organizações vazias |
| `HUB_DEMO_EMAIL` / `HUB_DEMO_PASSWORD` | usuário de demonstração opcional, criado no primeiro acesso a `/api/auth` (só para avaliação local) |

Não há credencial fixa no código. O cadastro é aberto por padrão (é um template de demonstração):
em produção, crie os usuários e defina `HUB_DISABLE_SIGNUP=true`.

## Testes

```bash
npm test           # vitest: 42 testes
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (só avisos de estilo)
```

Cobertura: parser de CSV; conversão de dinheiro e percentuais; motor de preço; contrato do
adaptador de canal; esquema de migrations; login, senha, sessão e configuração segura; e, contra um
PGlite de verdade, o isolamento entre organizações, estoque (ajustes, reserva, cancelamento),
importação e publicação de anúncios. Não há teste de interface (navegador) neste repositório.

## Estrutura

```
src/
  routes/            login e as 13 telas (painel, catálogo, mapeamentos, anúncios, preço,
                     estoque, pedidos, expedição, pós-venda, notas, conectores, ...)
  components/        shell, formulários e componentes de interface
  lib/
    auth/            better-auth (servidor e cliente), middleware das server functions
    hub/             regra de negócio: db.server.ts, adapters.server.ts, sync.server.ts,
                     seed.server.ts, preço/formatos, schemas zod
    db.ts            Postgres ou PGlite, com o mesmo contrato
migrations/          0001_auth.sql, 0002_hub.sql
scripts/             migrate.mjs (Postgres) e migration-plan.mjs
tests/               vitest
docs/adaptadores.md  contrato dos canais e roteiro de integração
```

## Limites honestos

- Adaptadores de canal, nota fiscal e etiqueta **simulados** (veja o aviso no topo).
- `pullOrders` hoje cria um pedido fictício localmente; não lê pedidos reais.
- Sem tela de gestão de usuários, recuperação de senha nem verificação de e-mail.
- Uma organização por usuário; não há convite de membros nem papéis.
- Sem fila, retentativa com espera nem webhooks: a sincronização roda dentro da requisição.
- Interface somente em português do Brasil, valores em BRL.
- Dados de demonstração (nomes, endereços, CNPJ `00.000.000/0000-00`) são fictícios.

## Licença

MIT (ver LICENSE na raiz).
