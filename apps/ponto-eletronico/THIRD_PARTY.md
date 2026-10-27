# Componentes de terceiros

Nada de terceiros está **dentro** deste repositório, exceto o texto da licença abaixo. A biblioteca de rosto e os
modelos são baixados por `node scripts/baixar-modelos.mjs`, que confere o SHA-256 de cada arquivo.

## Biblioteca: @vladmandic/human 3.3.6

- Origem: https://github.com/vladmandic/human, pacote npm `@vladmandic/human@3.3.6` (`dist/human.esm.js`).
- Licença: **MIT**, Copyright (c) Vladimir Mandic. Texto preservado em `third_party/LICENSE-human.txt`
  (o script também copia para `site/app/vendor/`).
- O bundle `human.esm.js` embute TensorFlow.js (Apache-2.0, Google) e outras dependências do pacote; o `package.json`
  do pacote lista cada uma. Ao redistribuir o bundle, mantenha os avisos dele.

## Modelos (pesos) usados: blazeface, facemesh, faceres, antispoof, liveness

O pacote `@vladmandic/human` é MIT, mas a página de modelos do projeto
(https://github.com/vladmandic/human/wiki/Models) diz que cada modelo tem a **licença inherited do modelo de
origem**. Conferido em 2026-10-27:

| modelo | uso aqui | origem declarada | licença da origem |
|---|---|---|---|
| blazeface | detectar rosto | MediaPipe BlazeFace (Google) | Apache-2.0 (MediaPipe; não reconferido arquivo a arquivo) |
| facemesh | malha facial (separa pessoas parecidas) | MediaPipe FaceMesh (Google) | Apache-2.0 (idem) |
| faceres | vetor do rosto (1024 dimensões) | HSE-FaceRes, github.com/HSE-asavchenko/HSE_FaceRec_tf | Apache-2.0 (página do repositório) |
| liveness | nota de vivacidade (só guardada) | LivenessNet convertido, github.com/leokwu/livenessnet | Apache-2.0 (página do repositório) |
| antispoof | nota "pessoa real" (gate de entrada) | "Real-or-Fake" (conjunto de dados do Kaggle) | **NÃO CONFIRMADA**: a documentação do Human não a declara |

Por causa da última linha, **os pesos não foram embutidos**: quem roda `scripts/baixar-modelos.mjs` baixa direto
do pacote oficial e assume a verificação. Antes de **vender ou redistribuir** com os modelos, confirme a licença
do `antispoof` (e releia as dos demais). Os arquivos baixados têm o mesmo conteúdo dos que o projeto usava
(conferido por hash em 2026-10-27).

SHA-256 esperados: ver `scripts/baixar-modelos.mjs`.
