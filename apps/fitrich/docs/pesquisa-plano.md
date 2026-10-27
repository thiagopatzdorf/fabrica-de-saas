# Fitrich: pesquisa e decisões da tela Plano (planejamento e patrimônio)

Área: independência financeira, plano mensal, reserva, quitação de dívida, renda fixa e marcos.
Código: `app/js/v2/plano.mjs` (motor), `app/js/v2/ui/telas/plano.mjs` (tela).
Testes: `tests/unit/fitrich-plano.test.mjs` e `tests/fitrich-ui/plano.navegador.mjs`.
Pesquisa feita em 2026-10-05. O que foi medido vence o que foi lido: todo valor de referência dos testes foi
calculado fora do código (aritmética decimal exata em Python, half-up em centavos).

## O que a pesquisa achou e o que decidimos

| tema | evidência | decisão |
|---|---|---|
| Regra dos 4% | Bengen (1994): 4% do patrimônio inicial, corrigido pela inflação, sobreviveu a todo período de 30 anos da série dos EUA desde 1926. Trinity Study (1998): com 50% ou mais em ações a taxa quase sempre sobrevive em 30 anos. [Wikipedia: 4% rule](https://en.wikipedia.org/wiki/4%25_rule) | Oferecida como versão "clássica", nunca como padrão. |
| Versões conservadoras | Morningstar (State of Retirement Income 2025): taxa-base de 3,9% para 30 anos numa carteira balanceada de 30–50% em ações (3,7% no ano anterior); Bengen (2025) defende 4,7% com gastos flexíveis. [Morningstar](https://www.morningstar.com/retirement/morningstars-retirement-income-research-finding-your-safe-withdrawal-rate) | Padrão do app: **3,5%**; também 4% e 3%. Faixa, não ponto. |
| Fora dos EUA | Pfau (2010), 20 países, 1900–2010: o 4% falhou em 2,3% dos casos nos EUA e em 71% na França; só Canadá, Suécia e Dinamarca ficaram acima de 4%. [Pfau](https://www.advisorperspectives.com/newsletters11/pdfs/An_International_Perspective_on_Safe_Withdrawal_Rates.pdf) | Ressalva visível na tela: base EUA, Brasil sem série comparável. Por isso 3,5%. |
| Monte Carlo | Retorno anual lognormal, R = exp(ln(1+μ) − σ²/2 + σZ) − 1, mantém a média em μ. Volatilidade histórica aproximada: 40/60 ≈ 8%, 60/40 ≈ 11%, ações ≈ 15–17%. [Advisor Perspectives](https://www.advisorperspectives.com/articles/2023/01/10/the-dangers-of-monte-carlo-simulations) | Perfis de oscilação 4%, 8% e 12% a.a.; mediana de 1.000 caminhos, semente fixa. Modelo declarado ilustrativo. |
| Reserva de emergência | Guias brasileiros convergem: CLT 3–6 meses (tem aviso prévio, seguro-desemprego e FGTS), autônomo/MEI/renda variável 6–12. [exemplo](https://investilize.com.br/blog/reserva-emergencia-clt-pj/) | Quatro faixas por estabilidade; alvo = ponto médio; dependentes e renda única empurram +1 mês cada até o teto. "Sugestão, não norma". |
| Bola de neve × avalanche | Gal e McShane (2012, Journal of Marketing Research, ~6.000 pessoas): fechar contas, independentemente do valor, prediz a quitação total. [Kellogg](https://www.kellogg.northwestern.edu/news_articles/2012/snowball-approach.aspx) | Três métodos lado a lado; o **híbrido** (vitória rápida primeiro, depois maior juro) existe por essa evidência. |
| FGC | R$ 250 mil por CPF por instituição, teto de R$ 1 milhão a cada 4 anos; cobre CDB, LCI, LCA, poupança. [Digio](https://www.digio.com.br/blog/salvando-grana/fgc-como-funciona-a-protecao-dos-seus-investimentos-na-pratica/) | Ressalva fixa no comparador. Tesouro Direto fora do FGC. |
| LCI/LCA | Isentas de IR para pessoa física (Lei 11.033/2004 e 11.076/2004). Prazo mínimo e carência mudaram em 2024 (LCI 12 meses, LCA 9) e em 2025 (6 meses sem IPCA). [InvestNews](https://investnews.com.br/investimentos/isencao-de-ir-nas-lci-e-lca-o-que-realmente-esta-valendo-nas-regras-dos-titulos-bancarios/) | Isenção no cálculo; carência **não** calculada, só avisada ("confira na emissão"). |
| 50/30/20 | Warren e Tyagi (2005), *All Your Worth*: 50% necessidades, 30% desejos, 20% poupança e dívida. | Só ponto de partida para comparar; o plano real parte do gasto medido. |

## Decisões tomadas sem pedir (e por quê)

1. **Persistência em `perfil.plano`**, não em singleton novo: `perfil` já é gravado no IndexedDB, então não toquei no armazém nem na mesclagem de arquivos. Validação própria (`validarPlano`, aditiva e opcional) em `esquema.mjs`.
2. **Taxas reais de projeção fixas em 2/4/6% a.a.** (editáveis). A taxa real de hoje pelos índices embarcados (CDI líquido de 15% de IR contra IPCA, Fisher: 708 bp) aparece só como referência: é um período atípico que não se projeta por décadas.
3. **Padrão de retirada 3,5%** (não 4%), pelos dados de Pfau e pela falta de série brasileira.
4. **Plano mensal em cascata**: necessidades → mínimos das dívidas → lazer (3/5 do que sobra, teto de 30% da renda; encolhe só o necessário se os mínimos apertam) → colchão de 1 mês → dívida cara (juro acima do rendimento líquido da renda fixa, por `quitarOuInvestir`) → reserva → metas com prazo → investimento. Pela ordem pedida, com uma nuance: o colchão de 1 mês vem **antes** da dívida cara (sem colchão a primeira surpresa volta ao rotativo) e o resto da reserva depois. A soma das linhas é sempre a renda (teste de propriedade com 200 casos).
5. **Híbrido** definido como: dívidas que a folga mensal (orçamento − mínimos) quita em até 3 meses vão primeiro (menor saldo); as demais por maior juro. Para isso `simularQuitacao` (dividas.mjs) passou a aceitar também uma função de comparação como `metodo` (2 linhas; método por nome segue igual).
6. **Comparador de renda fixa sem recomendar produto**: taxas digitadas pela pessoa (os valores iniciais são exemplos), coluna "CDB equivalente (% do CDI)" que responde a pergunta útil sem dado de mercado, e uma frase neutra sobre o maior líquido da simulação com a ressalva de que não pesa risco, liquidez nem garantia. Reusa `rendimentoAteVencimento` (IR regressivo, IOF, custódia): o motor guarda a taxa efetiva em bp inteiro (12,285% vira 12,29%), consistência mantida.
7. **Marcos** de R$ 10 mil a R$ 10 milhões, "X% do caminho" entre o último marco passado e o próximo; patrimônio negativo conta como zero; nada de sequência.
8. **Linhas zeradas do plano mensal somem** (menos o investimento): linha de R$ 0,00 com explicação é ruído.
9. Editar o plano em modo de dados de exemplo sai do exemplo (comportamento do shell para qualquer `mudar`); não alterei o shell.

## Fora desta entrega

Aposentadoria com fases (retirada, INSS/previdência, imposto na retirada), ajuste de aporte pela inflação de salário, Monte Carlo da fase de retirada (probabilidade de ruína), comparador de taxas com dados vivos (o app não usa rede), persistência das taxas do comparador de renda fixa.
