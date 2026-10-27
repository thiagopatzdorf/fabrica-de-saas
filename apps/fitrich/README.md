# Fitrich

**Fitrich is a local-first personal finance and fitness app: credit cards and installments, OFX/CSV import, budgets and net worth, plus workouts, nutrition and body tracking. It is a PWA written in plain JavaScript (ES modules), stores everything in the browser's IndexedDB, has no backend and makes no network requests. UI in Brazilian Portuguese and English.**

Fitrich é um app de finanças pessoais e de treino/nutrição/corpo que roda inteiro no aparelho: sem conta, sem servidor, sem
rastreamento. Funciona offline (service worker) e pode ser instalado como PWA ou empacotado como app Android/iOS com Capacitor.

## Recursos

**Finanças**
- Lançamentos (parser de texto rápido, como "mercado 45,90"), contas, categorias e regras de categorização automática (base com categorias do Brasil, aprende com suas correções).
- Cartões de crédito: faturas, fechamento e vencimento, parcelas, estorno e pagamento de fatura.
- Importação de extratos e faturas em **OFX** (SGML e XML) e **CSV** (Nubank, Inter e genérico), com prévia, detecção de duplicados e transferências.
- Orçamento, metas, dívidas (com plano de quitação), fluxo de caixa e "quanto posso gastar hoje".
- Patrimônio: ativos, investimentos (índices), câmbio e cripto, estimativa de IRPF/DAS/carnê-leão (sempre como estimativa).
- Plano financeiro com marcos, check-in semanal e revisão com insights (gasto fora do padrão, assinaturas, tendência).

**Treino, nutrição e corpo**
- Biblioteca de exercícios, rotinas, sessão de treino com séries, progressão sugerida, recordes, cardio e zonas de frequência cardíaca.
- Nutrição: diário de refeições sobre a **TACO** (609 alimentos), metas de energia/macros e tendência.
- Corpo: peso, medidas, composição, sono, água, bem-estar e fotos de progresso (guardadas só no aparelho).

**Plataforma**
- PT-BR e EN, tema claro/escuro, alto contraste, tamanho de texto ajustável, acessibilidade (alvo de toque de 44 px, foco visível, `prefers-reduced-motion`).
- PWA offline com pré-cache versionado pelo conteúdo; atualização só quando você aceita.
- Backup/restauração em JSON, opcionalmente **cifrado** (PBKDF2-SHA-256 com 600 000 iterações + AES-256-GCM, em Web Worker); mesclagem determinística entre dois aparelhos por arquivo.
- Política de segurança estrita (`_headers`): `connect-src 'none'`, sem script/estilo inline, sem terceiros.

## Privacidade

Tudo fica no aparelho (IndexedDB e localStorage do navegador ou do app). Não há conta, analytics, cookie de terceiro, fonte
externa nem requisição de rede durante o uso; a CSP (`connect-src 'none'`) faz o navegador bloquear qualquer envio, e há testes que
falham se uma chamada de rede aparecer no código. O texto da política está em `app/privacidade/` e `app/en/privacy/`.

## Como rodar

Precisa de Node 22+ (só para servir e testar; o app em si não tem dependências nem etapa de build).

```bash
npm run serve            # node scripts/servir.mjs -> http://127.0.0.1:8080/  (porta: npm run serve -- 3000)
```

Também serve qualquer servidor estático apontado para a pasta `app/` **como raiz do site** (os caminhos são absolutos, como `/js/app.mjs`; subpasta não é suportada):

```bash
python3 -m http.server 8080 --directory app
```

Abrir o `index.html` por `file://` não funciona (módulos ES e service worker exigem HTTP). O `scripts/servir.mjs` aplica os
cabeçalhos do `app/_headers`, então um erro de política aparece no console durante o desenvolvimento.

### Publicar

Copie `app/` para qualquer hospedagem estática com HTTPS que respeite o arquivo `_headers` (Cloudflare Pages/Workers, Netlify, ...). Antes, gere as
páginas com a sua URL pública (canonical, hreflang, Open Graph, `sitemap.xml`, `robots.txt`):

```bash
FITRICH_BASE_URL=https://seu-dominio.exemplo npm run build
```

Sem `FITRICH_BASE_URL`, o padrão é `https://fitrich.example.com` (um endereço de exemplo). Troque também o contato na seção
"Mudanças e contato" da política de privacidade em `scripts/fitrich_build.py` e o `appId` do app nativo.

## Como gerar o app nativo (Capacitor)

Não é executado aqui; os passos para quem publica estão em `mobile/README.md` e, em detalhe (Android Studio, Xcode, assinatura, lojas), em `docs/app-nativo.md`.

```bash
cd mobile
npm install
npm run android:add      # monta www/ a partir de ../app e cria o projeto Android
npm run sync             # depois de mudar o app
# iOS: npm run ios:add (precisa de um Mac com Xcode)
```

O `appId` em `mobile/capacitor.config.json` é `com.example.fitrich`: troque pelo seu antes de publicar.

## Testes

```bash
npm test                 # unitários (Node) + Python
npm run test:unit        # node --test tests/unit/*.test.mjs     -> 557 testes
npm run test:py          # unittest em tests/py                  -> 35 testes (Python 3.12+; build, PWA, CSP, site)
```

- `tests/unit/`: motores (cartão, parcelas, importação, patrimônio, tributos, treino, nutrição, corpo), contratos de tela, paridade PT/EN, design e o empacotamento nativo.
- `tests/py/`: o HTML gerado bate com o template, pré-cache e ícones batem com a pasta, nenhuma URL de terceiro, CSP aplicada num Chromium real (pula sozinho se não houver Playwright/Chromium). O gerador de ícones usa Pillow.
- `tests/ui/`: roteiros de navegador com Playwright (`node tests/ui/shell.navegador.mjs`; instruções em `tests/ui/LEIA-ME.md`). Precisam de `playwright` e de um Chromium instalados fora do projeto (`NODE_PATH` e `PLAYWRIGHT_BROWSERS_PATH`).
- `tests/referencia/`: implementações independentes (Páscoa/dias úteis e salário líquido) usadas só para conferir os cálculos do app.
- `tests/fixtures/`: extratos OFX/CSV de exemplo (fictícios; `gerar-fixtures.py` os recria).

## Estrutura

```
app/        o app publicável (HTML, CSS, JS/ESM, service worker, ícones, fontes, _headers)
  js/         v1 (shape/finanças simples) e js/v2/ (esquema, motores puros, ui/, telas/, i18n, plataforma/)
scripts/    geradores: fitrich_build.py (páginas, sitemap, privacidade), fitrich_plataforma.py (ícones + pré-cache do sw.js),
            fitrich_alimentos_build.py (base de alimentos a partir da TACO), servir.mjs (servidor estático)
tests/      unit/, py/, ui/, fixtures/, referencia/
mobile/     casca Capacitor (Android/iOS) e modelos TWA
docs/       design, pesquisa por área e guia do app nativo
```

Mexeu no app? Rode `npm run build`: ele regenera as páginas e a lista de pré-cache do `sw.js` (o teste falha se você esquecer).

## Limites honestos

- **Não é consultoria financeira, médica, nutricional nem de investimento.** IRPF, DAS, juros e metas de energia são estimativas simples; confira com um profissional.
- **Os dados ficam no navegador.** Limpar os dados do site, desinstalar o app ou perder o aparelho apaga tudo. O backup é por exportação (JSON, opcionalmente cifrado) e é responsabilidade de quem usa; backup cifrado com senha perdida não tem recuperação.
- Não há sincronização automática entre aparelhos (só por arquivo mesclável) nem conexão com bancos (Open Finance); a entrada é manual ou por OFX/CSV.
- A base de alimentos tem 609 itens (TACO + poucos itens de referência USDA); porções caseiras são medidas típicas aproximadas.
- O app nativo ainda não foi testado em aparelho nesta forma de empacotamento.
- Os roteiros de navegador (`tests/ui`, `tests/py` com Chromium) dependem da versão do Chromium: versões recentes emitem um aviso de console inofensivo ("preload ... cross-world service worker resource mismatch") que alguns roteiros tratam como falha.

## Créditos e licenças de dados

- Código: **MIT** (ver LICENSE na raiz do repositório).
- Tabela de alimentos: **TACO**, Tabela Brasileira de Composição de Alimentos, 4ª ed. rev. e ampl., NEPA/UNICAMP, 2011 (dados com atribuição; o NEPA não publica termos de licença, veja a pendência em `docs/pesquisa-nutricao.md`: confirme antes de redistribuir), e valores de referência do USDA FoodData Central (domínio público). O gerador `scripts/fitrich_alimentos_build.py` precisa do SQLite do projeto `raulfdm/taco-api` (código MIT) e **não** o inclui; o `.mjs` gerado já está no app.
- Fontes Sora e Manrope (`app/fonts/`): SIL Open Font License 1.1.
- Referências científicas das fórmulas (1RM, frequência cardíaca máxima, etc.) estão citadas em `docs/pesquisa-*.md`.
