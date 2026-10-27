# Links de Pagamento

**Links de Pagamento** is a small, dependency-free Cloudflare Worker that turns your own Stripe account into a payment-link service: fixed-amount, pay-what-you-want and monthly links, Pix and card (with installments in Brazil), a branded hosted checkout, a signed Stripe webhook that records who paid, and a token-protected API for your sites and agents. It ships with a local mode that fakes Stripe, so you can try the whole flow without touching real money. The interface and docs are in Brazilian Portuguese.

## O que é

Você cria um link curto (`/p/<id>`), manda por WhatsApp ou põe como botão em qualquer site. A cada acesso ao link, o Worker abre um Checkout Session novo no Stripe da **sua** conta. O dinheiro cai direto na sua conta Stripe: este projeto não guarda dinheiro nem cartão, só o link e o registro do pagamento.

## Recursos

- Link de **valor fixo**, **valor livre** (com mínimo) e **mensal/anual** (assinatura, com teste grátis opcional, cartão obrigatório).
- **Pix e cartão**, parcelamento no cartão (Brasil) em pagamento único; Apple Pay e Google Pay aparecem se a conta Stripe os tem ligados.
- **Checkout com a sua marca** (nome, cores, ícone e logo em `site/marca/`).
- **Webhook assinado** (HMAC-SHA256, tolerância de 5 min, idempotente pelo `evt_`): registra `pago`, `aguardando` (Pix) e o estado das assinaturas.
- **API** com token: criar link (idempotente por `ref`), listar links, pagamentos e assinaturas.
- Página `/novo` (celular) para criar links e ver pagamentos recentes; página `/configurar` para ligar o Stripe por um link de uso único.
- A chave do Stripe fica **cifrada** (AES-GCM, chave derivada de `SESSAO_SEGREDO`) no KV; nenhum valor volta para a tela.
- Teto de 30 aberturas por minuto por link (anti-robô). CSP restrita nas páginas. Sem dependências de runtime.

## Rodar local (modo Stripe falso)

Requer Node 20+ (testado com 22).

```sh
node servir-local.mjs        # http://localhost:8788
```

Sobe o Worker de verdade, KV em memória, `site/` como Static Assets e um **Stripe falso** (nada sai para api.stripe.com). Ele imprime o link de `/configurar` (qualquer chave de teste com 20+ caracteres, por exemplo `rk_test_` seguido de letras, serve) e o token da API local. Fluxo de exemplo:

```sh
TOKEN=token-local-so-para-desenvolver-123
# 1. ligue o Stripe falso: abra o link de /configurar impresso e cole uma chave de mentira
# 2. crie um link
curl -s -X POST localhost:8788/api/links -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"descricao":"Site institucional","valor":15000}'
# 3. abra o checkout (303 para o Checkout falso)
curl -si localhost:8788/p/<id>
```

## Configurar o Stripe de verdade

1. Tenha uma conta Stripe (Brasil, BRL). Em **Configurações → Formas de pagamento**, ligue o que quiser (cartão, Pix, parcelamento). O Pix exige a capacidade `pix_payments` na conta.
2. Crie uma **chave restrita** (`rk_live_...` ou `rk_test_...`), nunca a secreta cheia, com permissão de **escrita** em: Checkout Sessions, Prices, Products, Files, Webhook Endpoints.
3. Faça o deploy (abaixo), gere um convite e abra `/configurar`: a chave é conferida no Stripe, guardada cifrada e o webhook é criado sozinho. A página prova o que a chave consegue (`Checkout: ok|falhou`, `Marca: ok|falhou`).
4. **Convite de configuração** (link de uso único, 72 h): `SESSAO_SEGREDO=<o mesmo segredo do Worker> node gerar-convite.mjs https://seu-dominio`. Guarde o segredo que você gerou no deploy; ele não é impresso.

## Deploy no Cloudflare

Requer conta Cloudflare e o `wrangler` (`npx wrangler`). Nada abaixo é executado por este repositório.

```sh
cp wrangler.toml.example wrangler.toml
npx wrangler kv namespace create ESTADO      # cole o id em wrangler.toml
openssl rand -hex 32 | npx wrangler secret put PAGAR_TOKEN
openssl rand -hex 32 | npx wrangler secret put SESSAO_SEGREDO
npx wrangler deploy
```

Opcional: domínio próprio (bloco `routes` em `wrangler.toml`). Depois do deploy, gere o convite com `gerar-convite.mjs` (item 4 acima), abra o link e ligue o Stripe. Para desfazer: `npx wrangler delete`. O KV guarda a chave cifrada, os links e o registro de pagamentos: **exporte antes de apagar**. Sem o Worker, os `/p/<id>` já mandados param, mas o dinheiro e os dados continuam na sua conta Stripe.

## API

Com `Authorization: Bearer <PAGAR_TOKEN>`:

| rota | o que faz |
|---|---|
| `POST /api/links` | `{"descricao":"Site","valor":15000}` (centavos) · `{"descricao":"Apoio","livre":true,"minimo":1000}` · `{"descricao":"Plano","valor":9900,"recorrente":"month","teste_dias":30}` · opcionais `retorno` (https) e `ref` (idempotente). Entre R$ 1,00 e R$ 50.000,00 |
| `GET /api/links`, `GET /api/links/ref/<ref>` | lista / consulta por `ref` (diz se foi pago) |
| `GET /api/pagamentos` | quem pagou (vem do webhook) |
| `GET /api/assinaturas[?email=]` | estado da assinatura; `acesso` é `true` só em `trialing` e `active` |
| `POST /api/webhook/sincronizar` | acrescenta ao webhook os eventos novos |
| `GET /api/status` | público: se o Stripe está ligado |

`/r/pg-<32 hex>` abre o checkout de um link criado com `ref` nesse formato (para páginas de pedido que não guardam o id).

## Testes

```sh
node --test worker.test.mjs     # 62 testes, sem rede e sem dependências
```

## Variáveis e bindings

| nome | tipo | para quê |
|---|---|---|
| `PAGAR_TOKEN` | segredo | token da API (mín. 20 caracteres); sem ele a API não abre |
| `SESSAO_SEGREDO` | segredo | cifra a chave do Stripe e assina o convite; sem ele `/configurar` não funciona |
| `ESTADO` | KV | links, pagamentos, chave cifrada |
| `ASSETS` | Static Assets | pasta `site/` |

Veja `exemplo.env` e `wrangler.toml.example`.

## Estrutura

```
worker.js            entrada do Worker (rotas)
src/                 links, checkout, marca, webhook, assinaturas, configurar, sessão cifrada, cliente Stripe
site/                páginas estáticas (index, novo, configurar, obrigado, cancelado), marca/ e fontes
gerar-convite.mjs    link de uso único para ligar o Stripe
servir-local.mjs     servidor local com Stripe falso
worker.test.mjs      testes (node:test)
```

## Marca

Troque `site/marca/marca.json` (nome, cores, bordas) e os dois PNGs (ícone quadrado, logo) e publique. Os PNGs incluídos são um monograma "LP" genérico. Fontes Sora e Manrope: SIL OFL 1.1.

## Limites e avisos

- Cobrança de verdade exige **conta Stripe sua**, com as formas de pagamento ligadas; você é o responsável pela conta, pelos impostos e pelo atendimento ao pagador.
- O que foi testado: os 62 testes automatizados (Stripe simulado) e o fluxo local com Stripe falso. **Não foi testado em produção por terceiros** neste repositório, nem aqui se verificou contra o Stripe real durante a exportação. Faça primeiro um pagamento de teste (`rk_test_`) e depois um real de valor baixo.
- v0: sem reembolso, sem nota fiscal e sem e-mail de recibo daqui (o Stripe envia o dele).
- Assinatura cobra e renova no Stripe; **cancelar** é no painel do Stripe. No Brasil não há Pix recorrente: assinatura é só cartão. As renovações (`invoice.paid`) não entram na lista de pagamentos; use `/api/assinaturas`.
- Pix não é instantâneo: só o status `pago` conta como recebido.
- A versão da API do Stripe usada na marca do checkout é `2025-09-30.clover`; mudanças futuras do Stripe podem exigir ajuste.
- Quem tem o `PAGAR_TOKEN` cria links e lê pagamentos, mas não move dinheiro nem lê a chave do Stripe.
- Os conteúdos de `/novo` guardam o token no `localStorage` do aparelho; use só em aparelho seu.

## Licença

MIT (ver LICENSE na raiz).
