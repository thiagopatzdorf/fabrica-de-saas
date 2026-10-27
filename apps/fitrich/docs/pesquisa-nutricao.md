# Fitrich: pesquisa de nutrição (areté, meio-termo, proporção, sabedoria prática)

Escopo: base de alimentos brasileira, registro rápido, metas pelo meio-termo, adaptação pela tendência de peso, visão semanal e cruzamento opcional com Finanças. Princípio que guiou cada decisão: **nada em excesso**. Nem déficit extremo, nem proteína sem teto, nem tela que culpa. O que foi medido vence o que foi lido.

## Fontes e o que cada uma sustenta

| tema | fonte | uso aqui |
|---|---|---|
| composição dos alimentos | TACO, 4ª ed. revisada e ampliada, NEPA/UNICAMP, 2011 (597 alimentos) | 593 alimentos com energia (os outros 4 não trazem) |
| complementos | USDA FoodData Central (domínio público) e rótulo típico | 8 itens que a TACO não cobre (leite integral e desnatado, whey, pão de forma, pasta de amendoim, cottage, iogurte grego, pizza); marcados `origem 1` e avisados na tela |
| TMB | Mifflin et al., Am J Clin Nutr 1990; Frankenfield, Roth-Yousey, Compher, J Am Diet Assoc 2005;105:775-89 | é a equação que mais acerta a medição em adultos (dentro de 10%) |
| fatores de atividade | multiplicadores clássicos 1,2 / 1,375 / 1,55 / 1,725 / 1,9 | gasto total; superestimam com frequência, daí a correção por tendência |
| ritmo e piso | NHLBI (piso 1200 mulher / 1500 homem); 0,5 a 1% do peso por semana; Hall et al., Lancet 2011 (7700 kcal/kg é aproximação que superestima a perda no longo prazo) | limites seguros |
| proteína | RDA 0,8 g/kg; ISSN position stand 2017 (1,4 a 2,0 g/kg para quem se exercita); Morton et al., Br J Sports Med 2018 (~1,6 g/kg já capta o ganho de massa magra) | faixas por objetivo |
| fibra | Institute of Medicine: 14 g por 1000 kcal | meta de fibra |
| gordura e carboidrato | IOM/AMDR: gordura 20 a 35% da energia; carboidrato mínimo de 130 g | distribuição |
| água | EFSA 2010: 2,5 L (homem) e 2,0 L (mulher) de água total, ~20% vem da comida | meta de beber = 80% |
| tendência de peso | Hacker's Diet (J. Walker): média móvel exponencial com 10% de suavização | peso sem ruído de água |
| tom e vocabulário | Guia Alimentar para a População Brasileira (MS, 2014); plano-v2 do Fitrich (sem streak, sem culpa) | textos |

## Decisões (com o porquê)

1. **TACO inteira, gerada por script, não digitada.** `fitrich_alimentos_build.py` lê o SQLite do repo MIT `raulfdm/taco-api` (os DADOS são da TACO/NEPA) e emite `js/v2/nutricao/base-alimentos.mjs`: 609 linhas, 61 KB crus e 18 KB em gzip, carregado sob demanda pela tela (a carga inicial não mudou além de ~1 KB do esquema). Valor medido: Atwater (4P+4C+9G) fecha em 25%+15 kcal em todos os itens, exceto álcool, fermento e limão (teste).
2. **Itens sem energia na TACO saem** (leite, sal, iogurte de abacaxi, coco verde); macro nulo com energia vira 0 (óleos); fibra nula continua "não medida".
3. **Porções caseiras são medidas típicas arredondadas**, a TACO não as traz. A tela diz que são aproximadas e sempre dá a opção em gramas. Pratos e marmitas (10) são SOMA de itens da própria base (teste confere 150 g arroz + 100 g feijão = 107 kcal/100 g).
4. **Nomes em português, busca sem acento, termos em inglês só para os populares** (rice, egg, chicken...). Limite conhecido: base não traduzida.
5. **Registro em 2 toques**: o alimento (popular, recente, favorito ou resultado de busca) e "Adicionar". Quantidade padrão = última usada, senão 1 da primeira medida caseira; refeição pela hora do relógio. "Repetir ontem" é 1 toque. Medido no navegador: 2 toques.
6. **Registro guarda uma foto dos macros** (`refeicoes`): corrigir a base amanhã não reescreve o diário de ontem, e alimento próprio dispensa coleção. Água é o mesmo registro com `refeicao: "agua"` e ml.
7. **Meio-termo nos limites**: perder por padrão 0,5% do peso/semana (máx. 1%), ganhar 0,25% (máx. 0,5%); déficit nunca acima de 20% do gasto, superávit nunca acima de 15%; piso 1200/1500 kcal; se o piso passa do gasto (corpo pequeno), a meta é manter e o texto manda procurar um profissional. Fórmulas só para 18+; menor de 18 recebe aviso, não número.
8. **Proteína**: alvo = meio da faixa (0,8-1,2 sedentário; 1,0-1,6 leve; 1,4-2,0 treina; 1,6-2,2 ao perder ou ganhar). A faixa "leve" e o teto de 2,2 em déficit são decisão minha (o ISSN admite 2,3-3,1 em atletas magros em déficit; não é o público). Com IMC 30+ usa-se o peso ajustado. Nunca passa de 35% da energia.
9. **Gordura 27,5%** (meio de 20-35%); carboidrato é o resto, com mínimo de 130 g (a gordura cede até 20%).
10. **Adaptação sem culpa**: a cada 14 dias compara a taxa real da tendência (kg/sem) com a pedida; diferença ≤ 0,1 kg/sem = "no meio-termo"; senão sugere passos de até 250 kcal em múltiplos de 25 (erro × 1100 kcal/dia por kg/sem), sempre dentro dos limites. Exige 6 pesagens na janela, 3 semanas de história (a média leva ~3 semanas para parar de "puxar" o início: medido, com queda linear de 0,1 kg/dia ela mostra −0,62 e não −0,70 nos dias 14 a 27) e 10 dias de comida registrada de 14. Sem dado: "sem pressa". A pessoa aplica ou mantém; nada muda sozinho.
11. **"X das últimas 8 semanas"**: semana na faixa = 4+ dias registrados e média de kcal entre 90 e 110% da meta. Semana corrente fora da conta. Nunca sequência.
12. **Cruzamento com Finanças é opt-in** (`perfil.cruzamentoDelivery`, desligado por padrão): mercado, delivery e dias com refeição registrada, lado a lado, sem inferir nada. Com o interruptor desligado nenhum número de gasto aparece (teste de navegador).

## Esquema (aditivo)

- `refeicoes` (coleção nova, opcional: bancos e backups sem ela continuam válidos), store `refeicoes` no IndexedDB (versão do banco 1 para 2; o upgrade só cria o que falta; testado com banco v1 real no navegador).
- `perfil.nascimento`, `perfil.cruzamentoDelivery`, `perfil.nutricao { objetivo, atividade, ritmoPct, ajusteKcal, ultimoAjusteEm, treinaForca, proteinaGKg, aguaMl, favoritos[] }`, todos opcionais e validados.

## O que ficou de fora (de propósito)

- Tabela de alimentos em inglês; porções medidas (são típicas); micronutrientes (a TACO tem, o app não mostra); leitura de código de barras e rótulo (exigiria rede); relatório para nutricionista.
- Gestantes, menores de 18, doença renal, diabetes e histórico de transtorno alimentar: o app só avisa e manda procurar profissional. Não há modo clínico.
- Licença da TACO: o site do NEPA oferece o download livre, mas não publica termos de uso nem texto de licença (consultado em 05/10/2026). Os dados estão atribuídos na tela e aqui. **Pendência (quem redistribui)**: confirmar com o NEPA/UNICAMP que a redistribuição embutida em app aberto é permitida.
