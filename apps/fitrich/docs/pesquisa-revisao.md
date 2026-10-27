# Pesquisa: insights determinísticos e revisão semanal ("o motor aristotélico")

Área `revisao` do Fitrich v3. Código em `app/js/v2/insights/` (puro, sem DOM, rede nem
relógio), tela em `js/v2/ui/telas/revisao.mjs`, cartão da Hoje em `js/v2/ui/cartao-para-olhar.mjs`.
Regra desta pesquisa: o que foi medido vence o que foi lido; cada limiar abaixo tem teste dos dois lados em
`tests/unit/fitrich-revisao.test.mjs`, com números calculados à mão.

## O que a pesquisa disse e o que foi decidido

| tema | o que a fonte diz | decisão e limiar |
|---|---|---|
| Gasto fora do padrão | O escore z modificado, 0,6745·(x − mediana)/MAD, com corte em |z| > 3,5 (Iglewicz e Hoaglin), resiste a atípicos e a "mascaramento"; a média e o desvio comum são arrastados pelo próprio atípico. [statology](https://www.statology.org/modified-z-score/), [metricgate](https://metricgate.com/docs/robust-z-score-modified/) | `gasto-fora-do-padrao`: z > 3,5 **e** ≥ 2× a mediana **e** ≥ R$ 50, com ≥ 8 gastos de histórico na categoria. O piso de 2× e de R$ 50 é decisão nossa: z alto com valor pequeno é ruído de centavos. MAD = 0 (valores todos iguais): exige 3× a mediana. |
| Frequência e volume de treino | Treinar cada grupo ao menos 2×/semana rende hipertrofia maior que 1× quando o volume não é igualado (0,49 vs 0,30); com volume igual a frequência deixa de importar; 10 a 20 séries por grupo por semana é a faixa típica. [Schoenfeld 2016](https://www.researchgate.net/publication/301578131_Effects_of_Resistance_Training_Frequency_on_Measures_of_Muscle_Hypertrophy_A_Systematic_Review_and_Meta-Analysis), [Stronger by Science](https://www.strongerbyscience.com/frequency-muscle/) | `grupo-muscular-esquecido`: grupo com ≥ 2 sessões nos 28 dias anteriores às últimas 2 semanas e nenhuma nelas. Sem dado de grupo no esquema atual a regra fica calada (aceita `grupos`, `musculos` ou `exercicios[].grupo`). Não inventamos número de séries: o app não as registra. |
| Salto de carga | A razão aguda:crônica entre ~0,8 e 1,3 é associada a menos lesão e acima de 1,5 a mais, mas o poder preditivo é fraco e inconsistente entre esportes. [revisão sistemática (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12487117/), [crítica](https://arxiv.org/pdf/1907.05326) | `treino-volume-vs-media`: minutos da última semana fechada ≥ 150% da média das 4 anteriores (atenção, só com texto de cuidado, nunca de risco) e ≤ 50% (informativo). Evidência fraca, por isso o texto fala em "cuidado" e propõe um dia leve. |
| Ritmo de peso | 0,5 a 1 kg (ou 0,5 a 1% do peso) por semana é a referência usual de perda segura (OMS, NHS, AHA, CDC, via [síntese](https://nutrola.app/en/blog/what-is-the-safest-rate-of-weight-loss-per-week)); fonte secundária, por isso só usamos como **aviso**. | `peso-ritmo-rapido`: tendência (mínimos quadrados, 28 dias, ≥ 3 pesagens em ≥ 7 dias) de ≥ 1% da média por semana, para qualquer direção. Texto: "se não é intencional ou se você se sente mal, converse com um médico". Nenhum déficit alvo, nenhum piso calórico, nenhuma palavra sobre o corpo. |
| Comprometimento de renda | A regra 28/36 dos bancos limita o total de dívidas a 36% da renda bruta ([Chase](https://www.chase.com/personal/mortgage/education/buying-a-home/28-36-rule)); é critério de crédito, não lei. | `dividas-minimos-renda`: mínimos das dívidas ≥ 20% da renda média informa, ≥ 36% atenção. `parcelas-comprometem-renda`: 15% informa, 30% atenção (limiares nossos, heurística; o texto não cita 28/36 como norma). |
| Reserva | 3 a 6 meses de despesa essencial é a referência corrente ([Fidelity](https://www.fidelity.com/learning-center/smart-money/emergency-fund)); o app já usa essencial × meses em `metas.mjs`. | `reserva-curta`: < 1 mês atenção, < 3 meses informa. `dinheiro-parado`: sobra acima de 6 meses essenciais + 1 mês de giro (e ≥ R$ 1.000). O texto manda dar destino ao valor e diz que o app não recomenda produto. |
| 50/30/20 | Faixa clássica 50% necessidades, 30% desejos, 20% poupança. | `desejos-acima-da-faixa` > 35% e `necessidades-altas` > 60% (margem de 5 e de 10 pontos). O outro lado do meio-termo: `desejos-quase-zero` (≤ 5% por 3 meses) diz que prazer também sustenta o plano. |
| Meio-termo aristotélico | Virtude é o ponto entre a falta e o excesso, aprendido por hábito; felicidade (eudaimonia) é atividade, não sentimento. [Routledge](https://www.rep.routledge.com/dms/Aristotles-Ethics.pdf), [Wikipedia](https://en.wikipedia.org/wiki/Eudaimonia) | Equilíbrio em **faixas** com nome para os dois lados ("abaixo da faixa", "acima da faixa"), nunca um número único. Priorização com no máximo 3 insights, 2 por eixo, 2 de atenção. |
| Revisão e "três coisas boas" | Anotar três coisas boas por uma semana melhorou bem-estar por até 6 meses em ensaio de Seligman et al. (2005); praticar uma vez por semana rendeu mais que todo dia em alguns estudos. [Berkeley GGSC](https://ggia.berkeley.edu/practice/three-good-things), [Three Good Tools](https://www.tandfonline.com/doi/full/10.1080/17439760.2020.1789707) | Revisão semanal com **3 vitórias**, 1 ajuste e 1 intenção (olhar para trás e para frente). As vitórias são sugeridas a partir dos números, mas a pessoa escreve a dela. |

## Equilíbrio (eudaimonia): os quatro eixos e as faixas

| eixo | conta | faixa de equilíbrio | por quê |
|---|---|---|---|
| dinheiro | mediana da taxa de poupança de 3 meses fechados | 10% a 50% da receita | 20% (50/30/20) no meio; acima de 50% ainda não é "excesso" para quem faz FIRE, só avisa com leveza. |
| corpo | minutos de treino por semana, média de 4 semanas fechadas | 150 a 450 min | OMS: 150 a 300 min de atividade moderada já trazem o benefício; até 1,5× isso não é excesso (limite superior decisão nossa). |
| descanso | horas de sono (≥ 7 registros em 14 dias) ou, sem sono, dias sem treino por semana | 7 a 9 h; ou 2 a 7 dias | Adultos costumam precisar de ≥ 7 h. Sem coleção de sono usamos a folga de treino (o eixo avisa que a medida é mais fraca). |
| constância | semanas fechadas (de 8) com algum registro | 5 a 8 | "X das últimas 8 semanas", nunca sequência. Exige 4 semanas de uso. |

Eixo sem dado fica `sem_dado`: não vira zero. O resumo só conta eixos com dado.

## Decisões que tomei sozinho (para o maestro revisar)

1. **Onde guardar**: `perfil.insightsDispensados` (lista de chaves, ≤ 300) e `perfil.revisoes` (mapa segunda-feira ISO
   → `{vitorias[≤3], ajuste, intencao, atualizadoEm}`, ≤ 156 semanas). Em vez de uma coleção nova, porque coleção nova
   exige subir `VERSAO_BANCO` do IndexedDB e várias áreas estão mexendo em `COLECOES` em paralelo. `perfil` é singleton,
   já persiste e já faz merge por seção. Validação aditiva em `esquema.mjs` (`perfilExtrasErros`); perfil antigo segue válido.
2. **Coleções de outras áreas são lidas se existirem** e tratadas como vazias se não: `treinos[].grupos|musculos|exercicios[].grupo`,
   `sonos[]` (`{data, horas}`) e `refeicoes[]` (`{data}`). Se a área de treino/sono usar outros nomes, a mudança é uma linha em
   `base.mjs::gruposDoTreino` e `equilibrio.mjs::sonosDe`.
3. **Cartão da Hoje carrega sob demanda** (`import()` dinâmico na `hoje.mjs`, uma linha de CSS a mais). O motor e o dicionário (~50 KB) não pesam no
   carregamento inicial; o cartão usa um dicionário próprio, independente do shell.
4. **Prioridade** = impacto × acionabilidade (1 a 5 cada, na própria regra) × 1,5 se "atenção". Números escolhidos por mim; estão em cada regra e podem ser ajustados sem tocar no motor.
5. **Limiares que são heurística nossa** (sem fonte primária): 15%/30% de parcelas, 20% de dívidas, 5% de assinaturas, 5/10 pontos de margem 50/30/20, 1,5×/0,5× de volume, 14 dias de retomada, 21 dias sem pesar.
6. **Não fiz**: nenhuma regra com déficit calórico, piso de caloria ou comentário sobre corpo; nada de LLM; nada de rede.
