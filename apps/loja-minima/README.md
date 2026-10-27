# Loja Mínima

**Loja Mínima is a small, complete online store that runs in a single Cloudflare Worker: storefront, cart, Pix/card checkout (through a pluggable payment-links service), and an owner dashboard for products, orders and shipping. Prices are always recalculated on the server, there are no runtime dependencies and no build step. Licensed MIT.**

Uma loja pequena e completa em um único Cloudflare Worker: vitrine, carrinho, checkout (Pix e cartão, por um serviço de links de pagamento) e painel do dono para produtos, pedidos e frete. O preço é sempre recalculado no servidor. Sem dependências de execução e sem etapa de build.

## Recursos

| quem | o quê |
|---|---|
| cliente | vê a vitrine (categorias, lançamentos, busca), escolhe variação (tamanho, cor), monta o carrinho (fica no aparelho), preenche contato e entrega e paga pelo link de pagamento |
| dono | em `/admin.html`: cadastra produto (preço, fotos, estoque, variações, lançamento), vê pedidos com contato e endereço, marca como enviado com rastreio, ajusta nome, WhatsApp, frete e aviso do topo |
| agente de IA | `GET /api/agente` descreve o contrato; busca paginada em `/api/agente/catalogo`; compra em `POST /api/agente/pedidos` com `Idempotency-Key` (a repetição não cobra duas vezes). Guia em `/agentes.html` e `/llms.txt` |

Segurança embutida: preço, frete e estoque conferidos no servidor; painel com cookie assinado (`HttpOnly`, `Secure`, `SameSite=Lax`) de 12 h; 10 tentativas de chave por IP a cada 10 minutos; 20 pedidos por minuto por IP; escrita só por JSON do próprio site; CSP restrita em `site/_headers` (sem script inline; o texto de produto entra no DOM por `textContent`); a página pública do pedido nunca mostra endereço, telefone nem e-mail.

## Rodar local (sem Cloudflare e sem cobrar ninguém)

Precisa de Node 20 ou mais novo. Nada para instalar.

    node servir-local.mjs

Abre em http://localhost:8790 com 8 produtos fictícios (`exemplo/catalogo.json`), KV em memória e um provedor de pagamento **falso** embutido. O painel fica em http://localhost:8790/admin.html e a chave local é impressa no terminal (`chave-local-so-para-desenvolver-123`, só para desenvolvimento).

Variáveis opcionais: `PORT`, `ADMIN_TOKEN`, `PAGAR_PAGO=1` (o pagamento falso diz que todo pedido já foi pago, bom para ver estoque baixar e o pedido virar "pago"), `SEM_EXEMPLO=1` (começa sem produtos) e `PAGAR_URL` + `PAGAR_TOKEN` (usa um provedor de verdade, por exemplo o `links-de-pagamento` deste repositório rodando em outra porta). O estado local some quando o processo termina.

## Configurar o pagamento

Toda a conversa com o provedor mora em **um arquivo**, `src/pagamento.js`, com duas funções (`criarCobranca` e `situacao`). A loja funciona com o produto **`links-de-pagamento`** deste mesmo repositório (`apps/links-de-pagamento`) ou com qualquer outro serviço que siga o mesmo contrato HTTP:

    POST {PAGAR_URL}/api/links            Authorization: Bearer <PAGAR_TOKEN>
         corpo { descricao, valor (centavos), ref, retorno (https) }  ->  201 { "url": "https://..." }
         o mesmo `ref` devolve o mesmo link (idempotente)
    GET  {PAGAR_URL}/api/links/ref/<ref>  Authorization: Bearer <PAGAR_TOKEN>
         ->  200 { "pago": true|false }   |   404 se o `ref` não existe

Defina `PAGAR_URL` (variável) e `PAGAR_TOKEN` (segredo). Sem as duas, nenhum pedido é cobrado: a loja falha fechada.

**A confirmação é por consulta, não por webhook:** a página do pedido (e a lista do dono) pergunta ao provedor se o `ref` (`loja-<pedido>`) foi pago; a transição `aguardando_pagamento → pago` acontece uma vez e é ela que baixa o estoque. Para usar outro meio de pagamento, escreva outro `src/pagamento.js` com as mesmas duas funções.

## Colocar o seu catálogo

Pelo painel (`/admin.html`, aba de produtos) ou em massa por arquivo:

    node importar.mjs exemplo/produtos.csv --saida catalogo.json
    wrangler kv key put --binding ESTADO catalogo --path catalogo.json --remote

`importar.mjs` aceita CSV (vírgula ou ponto e vírgula, com aspas) ou JSON. Colunas: `id, nome, categoria, descricao, preco, preco_antigo, estoque, variacoes, fotos, destaque, ativo`. O preço é em **reais** (`59,90`); `variacoes` e `fotos` são separadas por `|`; estoque vazio significa "sem controle". Cada produto passa pelo mesmo validador do painel e o resumo diz quantos foram aceitos e recusados, por motivo. Ele **só transforma o arquivo**: não escreve em loja nenhuma. Foto é endereço `https` ou um caminho do próprio site (ex.: `/img/mochila.svg`, coloque o arquivo em `site/img/`). Atenção: gravar `catalogo` no KV **substitui o catálogo inteiro**.

## Deploy no Cloudflare

Precisa de uma conta Cloudflare e do [`wrangler`](https://developers.cloudflare.com/workers/wrangler/). Este repositório **não** inclui script de publicação nem IDs: o que segue é o caminho genérico (nada disso foi executado por quem preparou o repositório).

    wrangler kv namespace create ESTADO           # imprime o id; cole em kv_namespaces.id
    # edite PAGAR_URL e o id do KV no wrangler.toml
    wrangler secret put ADMIN_TOKEN               # a chave do painel (veja abaixo)
    wrangler secret put SESSAO_SEGREDO            # segredo longo e aleatório que assina o cookie
    wrangler secret put PAGAR_TOKEN               # token do serviço de pagamento
    wrangler deploy

Depois do deploy, aponte o seu domínio ao Worker (rota ou domínio personalizado, pelo painel da Cloudflare) e confira `https://SEU-DOMINIO/api/loja`.

**Piloto fechado por padrão:** `site/robots.txt` bloqueia tudo e `site/_headers` manda `X-Robots-Tag: noindex, nofollow`. Quando for abrir a loja ao público, troque o `robots.txt` e tire essa linha de `_headers`.

## Painel do dono: definir o `ADMIN_TOKEN`

O painel entra com uma **chave** (`ADMIN_TOKEN`) de **20 caracteres ou mais**. Gere uma e guarde-a em um gerenciador de senhas:

    node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"

Cole o resultado no prompt do `wrangler secret put ADMIN_TOKEN` (e gere outro valor, diferente, para `SESSAO_SEGREDO`). Para desenvolver com `wrangler dev`, copie `.dev.vars.example` para `.dev.vars` (ignorado pelo git). Sem `ADMIN_TOKEN` (ou com menos de 20 caracteres) o painel **não abre**: falha fechada. Trocar a chave é rodar `wrangler secret put ADMIN_TOKEN` de novo; trocar `SESSAO_SEGREDO` derruba todas as sessões abertas.

## Variáveis do Worker

| nome | tipo | para quê |
|---|---|---|
| `ESTADO` | binding de KV | catálogo (`catalogo`), configuração (`config`) e pedidos (`pedido:<id>`) |
| `ASSETS` | binding de Static Assets | a pasta `site/` |
| `ADMIN_TOKEN` | segredo | chave de entrada do painel (20+ caracteres) |
| `SESSAO_SEGREDO` | segredo | assina o cookie do painel |
| `PAGAR_URL` | variável | endereço do serviço de pagamento, sem barra no fim |
| `PAGAR_TOKEN` | segredo | token de acesso ao serviço de pagamento |

## Testes

    node --test

Roda os testes do Worker (pedido, preço no servidor, estoque, painel, limites), do contrato para agentes, do importador e da vitrine estática. Usam KV e provedor de pagamento de mentira; não tocam a rede.

## Estrutura

    worker.js            roteia /api/*; o resto é Static Assets
    src/pedido.js        cria o pedido, recalcula preço/frete/estoque, confere o pagamento
    src/pagamento.js     a única peça que conhece o provedor de pagamento
    src/catalogo.js      validação do produto e leitura do catálogo no KV
    src/admin.js         painel: entrada, produtos, config, pedidos
    src/agente.js        contrato e catálogo para agentes de IA
    src/config.js        nome, WhatsApp e frete (KV `config`)
    src/sessao.js        cookie assinado (HMAC) e cifra (AES-GCM) sem banco
    site/                vitrine, carrinho, painel, guia para agentes, llms.txt
    exemplo/             catálogo fictício em JSON e CSV
    importar.mjs         CSV/JSON -> catálogo da loja
    servir-local.mjs     servidor local com KV em memória e pagamento falso
    wrangler.toml        exemplo de deploy (sem IDs reais)

## Limites e avisos honestos

- **Frete** é fixo (valor único, com "grátis acima de"), configurável no painel. Não calcula por CEP nem integra transportadora ou Correios.
- **Estoque** é um número por produto no KV. **O KV não é transacional**: dois pagamentos conferidos no mesmo instante podem baixar o estoque duas vezes; o painel mostra o estoque para correção. Não integra marketplace, ERP nem outra loja.
- Sem reembolso, nota fiscal, cadastro de cliente ou cupom. Cancelar no painel não devolve dinheiro: a devolução é feita no provedor de pagamento.
- Dados pessoais do cliente (nome, WhatsApp, endereço) ficam no KV da conta de quem hospeda; apagar pedidos antigos é manual. A conformidade com a LGPD é de quem opera a loja.
- O catálogo inteiro é um valor só no KV: serve para algumas centenas de produtos e poucos pedidos por dia; acima disso o passo natural é D1.
- **Não testado em produção por terceiros.** Foi validado por testes automatizados e por um fluxo completo local (listar, pedir, entrar no painel). A interface no navegador (vitrine, carrinho, painel) é JavaScript simples e foi escrita para funcionar sem build, mas revise-a antes de vender de verdade; o deploy com `wrangler` descrito acima não foi executado a partir deste repositório.
- O pagamento autônomo por agente não existe: sempre há uma pessoa no link de pagamento.

## Licença

MIT (ver `LICENSE` na raiz).
