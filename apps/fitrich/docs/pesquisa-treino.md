# Pesquisa do motor de treino (Fitrich v3, área Treino)

Pesquisa feita em 2026-10-05 antes de codar. Regra da casa: o que foi **medido** vence o que foi lido; os números
abaixo estão em testes com valor calculado à mão (`tests/unit/fitrich-treino.test.mjs`).
Ferramenta de acompanhamento pessoal, não aconselhamento médico.

## O que a evidência diz, e o que decidimos

| tema | fonte | o que li | decisão no app |
|---|---|---|---|
| Volume semanal | Schoenfeld, Ogborn, Krieger (2017), *J Sports Sci*, meta-análise de 15 estudos | relação dose-resposta graduada: cada série semanal a mais ≈ +0,37% de hipertrofia; ≥10 séries/grupo/semana superou <10 | faixa de referência **10–20 séries por grupo por semana**; abaixo dela o app diz "abaixo da faixa", nunca "pouco" ou "insuficiente" |
| Retorno decrescente | Pelland et al. (2024), *Sports Med*, meta-regressão de 67 estudos | ganho cresce com o volume, com retorno decrescente claro acima de ~12–20 séries; contagem "fracionada" (indireto = 0,5) | teto 20 como "acima da faixa (retorno menor)"; **secundário conta 0,5, primário 1** |
| Frequência | Schoenfeld, Ogborn, Krieger (2016), *Sports Med* | 2x/semana por grupo superou 1x/semana, igualando volume | programas upper/lower e ABCD ficam descritos como "cada grupo duas vezes"; PPL e ABC com 3 dias dizem a verdade (1x) |
| Carga e faixa de reps | Schoenfeld et al. (2017), *J Strength Cond Res* | hipertrofia semelhante de cargas leves a pesadas; força máxima favorece cargas altas | faixas 5–8 (compostos pesados) até 12–15 e 20+ (isoladores, calistenia); dupla progressão dentro da faixa |
| Proximidade da falha / RIR | Zourdos et al. (2016), *J Strength Cond Res* (escala RPE por RIR); Refalo et al. (2023), *Sports Med* | RPE por repetições na reserva é válida; 1–3 RIR rende hipertrofia próxima à da falha com menos desconforto | campo **RIR** (0 a 4+) por série; meta "deixe 1 a 3 na reserva"; RIR soma às repetições no 1RM estimado |
| 1RM estimado | Epley (1985); Brzycki (1993); LeSuer et al. (1997), *J Strength Cond Res* | fórmulas ficam a ~3% do 1RM real entre 2 e 10 repetições; Brzycki perde confiança em muitas reps | média Epley+Brzycki de 2 a 10; só Epley de 11 a 20; **sem estimativa acima de 20**; Brzycki só até 12 |
| Descanso | Schoenfeld et al. (2016), *J Strength Cond Res* | 3 min rendeu mais força e mais espessura do quadríceps que 1 min em treinados | descanso sugerido: composto pesado 180 s, composto 120 s, isolador 75 s; ajustável (−15/+15 s) |
| Deload | Bell et al. (2023), *Sports Med Open*, consenso Delphi (34 coaches) | deload a cada 4–8 semanas, 5–7 dias, 40–60% menos volume, mesmos exercícios | convite com **8 semanas contínuas** ou **6 com 2 exercícios parados**; plano "7 dias, 50% menos séries, mesmas cargas"; sempre convite |
| FC máxima | Tanaka, Monahan, Seals (2001), *JACC* | 208 − 0,7 × idade erra menos que 220 − idade (sobretudo > 40 anos) | Tanaka por padrão, mostra a de Fox ao lado; a pessoa pode digitar a dela |
| Zonas | Karvonen (reserva de FC); ACSM (moderado 40–59% da reserva, vigoroso 60–89%) | zonas por reserva são mais coerentes entre pessoas | 5 zonas por Karvonen (50/60/70/80/90–100% da reserva) com FC de repouso, senão % da máxima |
| Meta de cardio | OMS (2020) | 150–300 min/semana de aeróbico moderado | barra até 150 min e "X das últimas 8 semanas com 150 min ou mais" (contagem, nunca sequência) |

## Prior art (o que os apps de referência fazem e o que levamos)

- **Dupla progressão** (faixa de reps + carga): padrão de Hevy, Strong e JEFIT para quem treina sem coach. Levado: sugestão determinística, sem aprendizado de máquina.
- **Sessão ao vivo** (série × carga × reps, "última vez", cronômetro automático, teclado grande): Strong, Hevy. Levado, com RIR por série e tela acesa (Wake Lock) durante a sessão.
- **Volume por grupo na semana**: Fitbod, RP Hypertrophy. Levado, contra faixa de evidência citada e sem pontuar a pessoa.
- **Detecção de platô**: RP/Fitbod usam regressão de 1RM; aqui é regra simples e auditável (4 sessões, 14 dias, 1%).
- Biblioteca de exercícios: **escrita aqui, 92 itens originais** (nomes, grupo, equipamento, padrão, músculos primários e secundários). Não foi copiada base com licença (free-exercise-db, wger, ExRx) nem imagem.

## Decisões minhas (a confirmar)

1. **Sessão ao vivo grava a cada série** na coleção `sessoes` (estado `andamento`) e vive no IndexedDB: sobrevive a recarregar, fechar a aba e ficar sem rede. Fechar a sessão cria também um registro em `treinos` (Musculação), então Shape, Metas e Hoje contam o treino sem saber do motor.
2. **Esquema aditivo**: `exercicios` (próprios), `rotinas`, `sessoes`, `cardio` + `perfil.idade|fcMaxBpm|fcRepousoBpm` (opcionais). Banco IDB vai à versão 2 (cria só as stores novas). Documento antigo sem as coleções abre normalmente (teste).
3. **Existência do exercício não é validada no esquema** (importar o catálogo estouraria os 120 KB da carga inicial): `exerciciosOrfaos(d)` confere na tela e nos testes.
4. Unidade única **kg** (sem lb). Isométricos (prancha) guardam **segundos** no campo repetições.
5. Platô e deload são **convites** e nunca bloqueiam nada; nenhum texto compara a pessoa com ninguém.
6. 1RM estimado soma RIR às repetições (8 reps com 2 na reserva pesam como 10). Sem RIR informado, assume 0 (subestima, o lado seguro).

## O que ficou de fora

Troca kg/lb; superséries e drop-sets; temporizador de séries cronometradas (prancha); pontos de entrada em Hoje (atalho "treinar agora" e o tile de volume): Hoje é do dono do shell; PWA offline com Service Worker (etapa de plataforma: os módulos da tela entram na lista de pré-cache quando existir); gráficos de volume por semana ao longo do tempo (a tabela mostra a semana escolhida).
