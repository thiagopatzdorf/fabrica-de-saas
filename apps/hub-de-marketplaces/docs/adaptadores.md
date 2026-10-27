# Adaptadores de canal

> **Estado atual: todos os adaptadores são SIMULADOS.** Nenhum deles fala com o
> Mercado Livre, a Shopee, a Amazon ou o Magalu. Cada chamada espera de 160 a 440 ms
> e falha em 5% das vezes, de propósito, para a interface mostrar erro e reenvio. Este
> documento descreve o contrato que o código já usa e o que falta para trocar o
> simulado por integração real.

## Onde está

| Arquivo | Papel |
|---|---|
| `src/lib/hub/adapters.server.ts` | interface `ChannelAdapter`, a fábrica `getAdapter(canal)` e a sonda `probeChannel()` (hoje simuladas) |
| `src/lib/hub/channels.ts` | lista de canais (`ml`, `shopee`, `amazon`, `magalu`, `store`), categorias de cada canal e transportadoras |
| `src/lib/hub/oauth.ts` | esqueleto, desligado, do OAuth real de cada canal (endpoints anotados em comentário) |
| `src/lib/hub/db.server.ts` | a regra de negócio: chama o adaptador, grava o resultado e o log |
| `src/lib/hub/sync.server.ts` | propaga o saldo de estoque do produto para todos os anúncios (`updateStock`) |
| `tests/adapters.test.ts` | trava o contrato abaixo; um adaptador real deve passar nos mesmos casos |

## A interface

```ts
type AdapterResult = { ok: true; externalId: string } | { ok: false; error: string };

interface ChannelAdapter {
  publish(i: { sku; title; priceCents; stock; kind: "simple" | "variation" | "catalog" }): Promise<AdapterResult>;
  updatePrice(i: { externalId; sku; priceCents }): Promise<AdapterResult>;
  updateStock(i: { externalId; sku; stock }): Promise<AdapterResult>;
  pullOrders(): Promise<AdapterResult>;
  pushTracking(i: { externalId; tracking; carrier }): Promise<AdapterResult>;
  answerQuestion(i: { externalId; body }): Promise<AdapterResult>;
}
```

Regras do contrato (o resto do app depende delas):

1. **Nunca lance exceção para falha do canal.** Devolva `{ ok: false, error }` com texto
   legível em português; o app grava em `sync_logs`, marca o anúncio como `error` e mostra
   a mensagem. Exceção só para bug.
2. **`externalId` é o id do anúncio no canal.** `publish` devolve o id novo; `updatePrice`
   e `updateStock` devolvem o mesmo id que receberam (ou um id atualizado).
3. **Preço em centavos (inteiro) e estoque em unidades** em toda a fronteira. Converta para o
   formato do canal dentro do adaptador.
4. **Idempotência:** o app pode repetir `updateStock`/`updatePrice` (reenvio manual, nova
   sincronização). O canal tem de aceitar o mesmo valor duas vezes.
5. **Sem estado de tenant no módulo.** `getAdapter(canal)` hoje devolve um adaptador por canal,
   compartilhado entre todas as organizações.

## O que falta para integrar de verdade (trabalho real, não só trocar o arquivo)

Os pontos abaixo são limites conhecidos do template, não detalhes:

- **Credenciais por conta.** A tabela `channel_accounts` não guarda token. Para o OAuth real é
  preciso uma migration nova (`0003_*.sql`) com token de acesso, refresh token e validade
  **cifrados**, o callback de OAuth (esboço em `oauth.ts`) e `getAdapter` receber a conta
  (`getAdapter(canal, conta)`), porque hoje a assinatura não tem como saber de quem é o token.
  Hoje `connectAccount` apenas cria a linha da conta em modo "mock".
- **`pullOrders()` não devolve pedidos.** O contrato atual devolve só `{ ok, externalId }`, e o
  `pullOrders` do `db.server.ts` fabrica um pedido local com "Comprador do canal". Uma
  integração real precisa mudar o retorno para uma lista de pedidos do canal (comprador,
  itens com o `externalId` do anúncio, frete, prazo, endereço) e o `db.server.ts` passar a
  gravá-los, casando cada item com o anúncio pelo `external_id` e deduplicando pelo id do
  pedido no canal.
- **Notificações do canal (webhooks).** Não existe rota de webhook; a coleta de pedidos e
  perguntas é manual (botão) e `answerQuestion` recebe o id interno da pergunta, não o do canal.
- **Limites e erros do canal.** Cada API tem rate limit, paginação e códigos de erro próprios.
  Não há fila, retentativa com espera nem *circuit breaker*; `sync.server.ts` chama o canal em
  série dentro da requisição.
- **Nota fiscal e etiqueta são simuladas à parte.** `emitInvoices` gera uma chave de acesso
  fictícia e a tela de expedição imprime uma "etiqueta simulada". Nota real exige emissor
  fiscal (NF-e na SEFAZ ou um provedor) e etiqueta real exige a API da transportadora.
  Nada disso passa por `ChannelAdapter`.
- **Categorias e atributos.** `CHANNEL_CATEGORIES` é uma amostra fixa de cinco categorias por
  canal. Em produção as categorias e os atributos obrigatórios vêm da API de cada canal.

## Passo a passo sugerido para o primeiro canal real

1. Escreva `tests/<canal>.contract.test.ts` apontando para a API de sandbox do canal, reaproveitando
   os casos de `tests/adapters.test.ts`.
2. Crie `src/lib/hub/adapters/<canal>.server.ts` implementando `ChannelAdapter` e registre-o em
   `getAdapter` (um `switch` no canal; os demais seguem simulados).
3. Faça a migration das credenciais e o fluxo OAuth; troque `connectAccount` por `oauthStart` + callback.
4. Mude o contrato de `pullOrders` e o `db.server.ts` como descrito acima.
5. Rode `npm test` e depois uma publicação de ponta a ponta numa conta de teste do canal.
