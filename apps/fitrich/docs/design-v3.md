# Fitrich v3: design, onboarding, texto e acessibilidade

Leitura de "grego, aristotélico" como **design, não enfeite**: proporção (escala √φ e espaço de Fibonacci), simetria e respiração, paleta contida (neutros quentes, azul-egeu, terracota, verde-água e **um** acento de azeite), ícones de traço único, uma ideia por tela, texto com sabedoria prática ("o meio-termo", "um de cada vez") sem moralismo. A única ornamentação é a marca de azeite: um traço dourado de 34×3 px no topo do cartão-herói e do onboarding.

Os valores abaixo vivem em `app/css/app.css`. O teste `tests/unit/fitrich-design.test.mjs` lê esse arquivo e falha se um par perder o contraste AA. Nomes antigos (`--azul`, `--laranja`, `--agua`, `--sup*`, `--ink*`, `--grade`, `--eixo`) continuam valendo: as telas não mudam.

## Tokens

| grupo | tokens | valor (claro) |
|---|---|---|
| superfície | `--sup` `--sup2` `--sup3` | #fbf9f4 · #f3efe6 · #e8e2d3 (mármore, pergaminho) |
| tinta | `--ink` `--ink2` `--mud` | #1a1814 · #514b3d · #665e4c |
| linha | `--grade` (decorativa) `--eixo` (borda de campo, 3:1) | #e2dccd · #8c8470 |
| cor | `--azul` (egeu) `--laranja` (terracota) `--agua` (marca) `--agua-t` (texto) | #1f60ae · #a8451a · #05806a · #00786b |
| acento | `--ouro` (texto) `--ouro-vivo` (marca) | #7d5c00 · #a87b00 |
| sobre cor | `--sobre-azul` `--sobre-laranja` | #ffffff (no escuro, tinta escura) |
| tipo (√φ ≈ 1,272 sobre 1 rem) | `--t-2` `--t-1` `--t0` `--t1` `--t2` `--t3` `--t4` `--t5` | .789 · .886 · 1 · 1,272 · 1,618 · 2,058 · 2,618 · 3,33 rem |
| espaço (Fibonacci) | `--e1`…`--e6` | 4 · 8 · 13 · 21 · 34 · 55 px em rem |
| forma | `--raio` `--raio-p` `--raio-g` `--toque` | 1 · .625 · 1,3125 · 2,75 rem (44 px) |
| sombra | `--sombra-1` `--sombra-2` | quentes, sem preto puro |
| movimento | `--mov-r` `--mov` `--ease` | 150 ms · 200 ms · cubic-bezier(.2,.7,.2,1) |

Fontes: Sora (títulos) e Manrope (texto), as já carregadas. Tamanho sempre em **rem** (teste proíbe `px` em `font`): o ajuste de texto do sistema vale, e `html[data-gs-texto="grande"]` sobe a base para 118,75%.

Temas: claro, escuro (`data-gs-theme="dark"`) e **alto contraste** (`data-gs-contraste="alto"`, em `css/alto-contraste.css`, injetado pelo `tema.js` antes da pintura só para quem pediu ou tem `prefers-contrast: more`). Escolha em Mais → Aparência (Alto contraste, Texto maior), guardada só no aparelho.

## Como foi validado

- **Texto e UI (WCAG 2.2 AA):** 30 pares por tema (4,5:1 texto; 3:1 borda, foco, marca) nos 4 temas, no teste acima. Alto contraste: texto secundário ≥ 7:1.
- **Séries de gráfico:** `validate_palette.js` do skill dataviz. Claro, superfície #fbf9f4: azul #1f60ae, terracota #a8451a, água #05806a, ouro #a87b00: faixa de luminosidade, CVD (pior par ΔE 9,3, protan) e piso de visão normal (18,0) passam; contraste ≥ 3:1. Escuro, superfície #1a1917: #5596e6, #d9703c, #27a68e, #b58e2c passam (CVD 11,5; normal 16,6). Achado: o `--agua` antigo (#0f7f6c) já reprovava o piso de croma; por isso `--agua` ficou #05806a e o texto verde usa `--agua-t`.
- **Navegador (Chromium):** `tests/fitrich-ui/design.navegador.mjs`: 176 combinações (390/1024 px × claro/escuro × pt/en × vazio/exemplo × 11 telas) sem erro de console, sem `style=`, sem estouro, um `h1` por tela, alvos ≥ 44 px; onboarding; foco de 3 px na ordem de tab; `ariaSnapshot` da Hoje; CLS 0 após clique e < 0,1 na navegação; movimento reduzido; entrada de 200 ms.

## Estados vazios que ensinam

`ctx.estadoVazio({ icone, titulo, texto, acoes })` (`ui/estado-vazio.mjs`): O quê? Por quê? E agora? Textos em `ui/vazios.i18n.mjs` (prefixo `vazio.`). Tela nova usa a peça e acrescenta suas chaves ali ou no próprio dicionário.

## Onboarding

Primeiro uso, app vazio: 1) idioma (troca de página `/` e `/en/` e retoma no passo 2), 2) objetivo (finanças, corpo, os dois; guardado em `fitrich-objetivo` e usado pelo estado vazio da Hoje), 3) primeira conta e primeiro peso, opcionais. Pular existe em todos os passos (botão, Esc, fundo) e conta como feito. Navegador automatizado (`navigator.webdriver`) não vê o onboarding, para não travar testes de tela; o teste dele usa `fitrich-onboarding=forcar`.

## Slot da Hoje (cartão de insights)

`ui/slots-hoje.mjs` exporta `SLOTS_HOJE`. Para plugar um cartão, **uma linha**: `{ id: "insights", ordem: 10, carregar: () => import("./telas/hoje-insights.mjs") }`; o módulo exporta `cartao = { montar(ctx) → { elemento, atualizar?, destruir? } }`. Entra entre o alerta e os tiles, sob demanda.

## Acessibilidade

Link "pular para o conteúdo"; foco de 3 px com halo (4 px em alto contraste); foco inicial não é roubado pela tela; região `aria-live` da Hoje (recriada só quando o número muda); tiles como lista rotulada; estado em texto, nunca só cor; `forced-colors` tratado; `prefers-reduced-motion` zera animação e transição de todo CSS.

## Performance percebida

Esqueleto só se a tela passar de 120 ms; entradas de 200 ms; `#vista` com altura mínima. Carga inicial: 116,7 KB de 120 KB (alto contraste, aparência, onboarding e componentes saem da carga inicial).

## Fora desta entrega

Firefox e WebKit: não instalados neste ambiente (o script os usa se existirem). Sem leitor de tela real: só a árvore de acessibilidade. Telas de outros donos: só tokens e CSS compartilhado, estados vazios e mensagens de erro.
