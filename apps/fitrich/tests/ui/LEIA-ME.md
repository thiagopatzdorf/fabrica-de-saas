# Testes de navegador do shell do Fitrich v2

`shell.navegador.mjs` sobe um servidor estático da pasta `fitrich/` e roda, num Chromium headless (Playwright):

- app vazio em 390 px e 1024 px, claro e escuro, pt-BR e `/en/`: sem erro de console, sem
  estouro horizontal, `faltando()` vazio, nenhum `style=` no DOM, capturas em `capturas/`;
- lançar uma despesa em menos de 20 s pelo caminho de 3 toques, desfazer em 5 s, parser do
  texto livre ("almoço 32 mercado");
- dados de exemplo entram e somem no primeiro lançamento real (nada de exemplo vai ao IDB);
- migração de um backup v1 real (`fixtures/backup-v1.json`, gerado com o próprio `dados.mjs` v1):
  aviso de 90 dias, contagens batem, chave v1 intacta;
- troca de idioma (persistida em `fitrich-idioma`) e de tema (`gs-prisma-theme`);
- as telas reais (Finanças e Cartões) entram pelo contrato `tela`, com CSS comum e da tela carregados em paralelo.

Rodar (da raiz do repo):

    NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> \
      node tests/ui/shell.navegador.mjs

Fora do `node --test` de propósito (precisa de Playwright e Chromium). As capturas geradas ficam
fora do git (`capturas/` está no `.gitignore` desta pasta): são para OLHAR antes de entregar.

## Tela Plano

`plano.navegador.mjs`: as cinco abas da tela Plano em 390 e 1024 px, claro e escuro, pt-BR e `/en/` (sem erro de console, sem
estouro, `faltando()` vazio, sem `style=`, campos com label, gráfico com title/desc, alvos >= 44 px), e o ponta a ponta (renda
digitada vira `perfil.plano` e sobrevive ao recarregar, Monte Carlo igual a cada cálculo, taxas fora de ordem recusadas).
Mesmo comando do shell, trocando o arquivo.

## Revisão da semana, insights e equilíbrio

`revisao.navegador.mjs` (mesma forma, serve também `/tests/`) carrega dados reais no IndexedDB e confere, em 390 e 1024 px,
claro e escuro, pt-BR e `/en/`: sem erro de console, sem `style=`, sem estouro horizontal, `faltando()` vazio, **contraste
medido ≥ 4,5:1** dos textos, e os fluxos (dispensar persiste depois do reload, revisão salva e volta, exportar em
texto, navegar entre semanas, equilíbrio com régua e tabela). Capturas `capturas/revisao-*.png` para olhar.

    NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> \
      node tests/ui/revisao.navegador.mjs

## Treino (`treino.navegador.mjs`)

Mesmo servidor estático. Cobre as 5 abas da tela Treino em 390 e 1024 px, claro e escuro, pt-BR e `/en/` (sem erro
de console, sem `style=`, sem estouro horizontal, `faltando()` vazio) e o fluxo real: programa ABC, editar rotina,
sessão ao vivo (cronômetro correndo, alvos >= 44 px, sessão sobrevive a recarregar), concluir (grava `sessoes` e `treinos`)
e cardio com ritmo e zonas de Karvonen. Capturas em `capturas/treino-*.png`.

    NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> \
      node tests/ui/treino.navegador.mjs

`design.navegador.mjs` (v3): matriz de 176 combinações (390/1024 px, claro/escuro, pt/en, vazio/exemplo, 11 telas), onboarding, foco e ordem de tab, alvos de 44 px, alto contraste, texto maior, movimento reduzido, `ariaSnapshot`, CLS e o slot de insights da Hoje. Mesmo comando do shell, outro arquivo. Firefox e WebKit entram se estiverem instalados.

## Auditoria do app instalável (`app.navegador.mjs`)

Sobe o site com a CSP REAL do `_headers` e prova, num Chromium headless:

- **offline em todas as telas registradas** (`context.setOffline(true)` e o servidor sem receber nenhum pedido), `/en/`, privacidade e o atalho `#/lancar`;
- instalabilidade (`Page.getInstallabilityErrors` vazio, manifest sem erro, ícones maskable e monocromático);
- **atualização sem perder dados**: versão nova vira faixa, "Atualizar" troca o pacote, o cache velho some;
- "limpei o cache e o service worker": os dados continuam e o app volta a abrir offline;
- backup cifrado ida e volta pela tela Dados (exporta, apaga o banco, importa com a senha, dados idênticos);
- instalar no Android (`beforeinstallprompt`) e no iPhone (instrução), aviso honesto de armazenamento, casca nativa simulada (Capacitor falso);
- a tela "Meu app" em 390 e 1024 px, claro e escuro, pt-BR e en.

    NODE_PATH=<node_modules global com playwright> PLAYWRIGHT_BROWSERS_PATH=<pasta dos navegadores> \
      node tests/ui/app.navegador.mjs
