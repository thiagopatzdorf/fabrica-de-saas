# Pesquisa: Corpo, sono e recuperação (Fitrich v3)

Registro do que foi lido, do que foi decidido e por quê. Regra da casa: o que foi medido vence o que foi lido; cada
número do app tem teste com valor de referência calculado à mão (`tests/unit/fitrich-corpo.test.mjs`).
É acompanhamento pessoal, não aconselhamento médico: nenhuma faixa vira "nota" e nenhum índice diagnostica.

## Composição corporal
| índice | fonte | decisão |
|---|---|---|
| IMC | OMS (adultos): 18,5 / 25 / 30 | Faixa "de referência", nunca "peso ideal". Ressalva na tela: ignora músculo, idade, etnia e distribuição de gordura. Mostra o intervalo de peso da faixa para a altura, como informação. |
| % gordura | Método da Marinha dos EUA (Hodgdon e Beckett, 1984), já em `js/shape.mjs` da v1 | Reuso, não cópia. Erro típico de 3 a 4 pontos percentuais declarado. Faixas descritivas do ACE (essencial, atleta, fitness, média, alta), limite superior exclusivo. |
| RCQ | OMS, consulta de especialistas 2008: > 0,90 homens, > 0,85 mulheres | Corte estritamente acima, como no texto da OMS (teste de borda). |
| RCE | Ashwell 2012; NICE 2022: 0,40 a 0,49 referência, 0,50 a 0,59 aumentada, 0,60 ou mais alta; abaixo de 0,40 "atenção" | Classifica o valor bruto (84,9 ÷ 170 = 0,4994 não vira 0,50 por arredondamento). |
| Massa magra | peso × (1 − gordura) | Herda a incerteza do % de gordura (dito na tela). |
| FFMI | Kouri et al., 1995: FFMI + 6,1 × (1,8 − h) | Só homens têm referência publicada (~25 como teto observado em atletas sem esteroides, amostra pequena e discutida). Mulheres: sem faixa, em vez de inventar uma. |

Medidas: cada campo usa o valor mais recente dentro de 30 dias da medição mais nova (uma medição só de cintura não apaga o pescoço).
Fotos de progresso: IndexedDB próprio (`fitrich-fotos`), fora do documento, do backup e da sincronia; reduzidas no aparelho (1.280 px, JPEG),
o que também descarta a EXIF de localização. Comparação lado a lado.

## Tendência de peso
- Média móvel exponencial com α = 0,1 por dia (John Walker, *The Hacker's Diet*). Decisão: com buracos no calendário o fator vale por dia,
  `1 − (1 − α)^g` para g dias sem pesar (g = 1 reproduz o livro). Várias pesagens no mesmo dia viram a média do dia.
- Ritmo semanal: reta de mínimos quadrados nos pesos crus dos últimos 28 dias (não na tendência, para o erro-padrão ser honesto), com
  erro-padrão da inclinação e margem de 95% (t de Student por graus de liberdade). Exige 4 dias pesados e 14 dias de intervalo.
- Projeção até a meta com faixa: se a faixa do ritmo cruza o zero, **não há data** ("os dados ainda não dizem"); isso é a resposta ao pânico com flutuação.
- Oscilação típica = desvio dos pesos em torno da tendência.
- Avisos de proporção, sem bloquear: perda acima de 1% do peso por semana e meta de peso com IMC abaixo de 18,5 recomendam conversar com um profissional.

## Sono
- Faixas: National Sleep Foundation 2015 (Hirshkowitz et al.): 6 a 13 anos 9 a 11 h; 14 a 17, 8 a 10 h; 18 a 64, 7 a 9 h; 65 ou mais, 7 a 8 h.
  O consenso AASM/SRS 2015 (Watson et al.) converge em 7 h ou mais para adultos. Meta padrão = meio da faixa (adulto 8 h); a pessoa pode digitar a dela.
  Sem nascimento: faixa de adulto, avisado na tela.
- Regularidade: desvio-padrão amostral do ponto médio do sono (diferença circular, 23:50 e 00:10 estão a 20 min). Cortes de 30 e 60 min são **heurística
  declarada**; a literatura usa o Sleep Regularity Index (Phillips et al., 2017) e associa variabilidade acima de 60 min a pior saúde cardiometabólica.
- "Dívida" de sono: soma de max(0, meta − horas) nas noites registradas dos últimos 7 dias, com mínimo de 3 noites. É um modelo, e a tela diz que
  recuperar não é 1 para 1 nem de uma vez.

## Hidratação
30 ml por kg por dia **de bebidas**, arredondado a 50 ml, preso entre 1.500 e 4.000 ml; sem peso, 2.000 ml. Base: regra de bolso de 30 a 35 ml/kg (escolhido o
extremo baixo porque a comida traz ~20% da água) conferida contra a EFSA 2010 (ingestão adequada de água total 2,0 L mulheres e 2,5 L homens; ~80% de bebidas,
isto é 1,6 e 2,0 L). Meio-termo grego: acima de 1,5 × a meta a tela diz que beber além da sede não traz ganho. Ressalva para calor, gestação e doenças renais ou cardíacas.

## Recuperação (índice transparente)
Soma ponderada dos termos que têm dado, reescalada a 0 a 100: sono 40 (0,7 × min(horas/meta, 1) + 0,3 × qualidade), energia 25, dor 20 (menos é melhor), carga 15.
Carga: sessão-RPE de Foster (minutos × CR10; o esforço 1 a 5 do app × 2) e razão aguda:crônica (7 dias contra 28 dias; Gabbett 2016: 0,8 a 1,3 como zona confortável).
**Ressalva honesta:** Impellizzeri et al. (2020) criticam o ACWR (acoplamento matemático, validade preditiva não demonstrada). Por isso a carga pesa só 15, só aparece com 14 dias de
histórico, só penaliza acima de 1,3 (zero em 1,8) e a tela diz que é regra de bolso. Sem relato da pessoa (sono, energia ou dor) o índice é nulo: só carga não é recuperação.
Faixas: 70 ou mais boa, 50 a 69 moderada, abaixo "pede um dia leve", com sugestão sem moralismo. Dor 4 ou 5 liga o aviso de procurar um profissional.

## Esquema (aditivo)
Coleção `bemestar` (um item por data: sonoHoras, sonoQualidade, dormiuMin, acordouMin, energia, dor, aguaMl, todos opcionais) e dois campos opcionais no perfil
(`nascimento`, `metaSonoHoras`). IndexedDB sobe de versão 1 para 2 só para criar a store nova. Backup v2 sem a coleção continua abrindo (entra vazia).

## Fica de fora
Frequência cardíaca e HRV (sem sensor), calorias e macros (outra área), integração com relógios, exportação PDF nativa (o HTML imprime e salva como PDF).
