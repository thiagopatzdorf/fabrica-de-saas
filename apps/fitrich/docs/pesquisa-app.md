# Pesquisa: app instalável, offline e empacotamento (Fitrich)

Feita em 2026-10-05, antes de codar, para a área "app/PWA/offline". Regra da casa: o que foi **medido** vence o que
foi lido; cada decisão abaixo diz qual é qual.

## O que a evidência diz

| Tema | Achado | Fonte | Decisão |
|---|---|---|---|
| Instalabilidade (Chrome) | HTTPS, manifest com nome, ícones 192 e 512, `start_url` no escopo, `display` standalone/fullscreen/minimal-ui, service worker com `fetch`. Faltar uma condição retira o prompt em silêncio. Com `screenshots` no manifest o Chrome mostra o diálogo "rico". | [frontendchecklist.io](https://frontendchecklist.io/rules/html/pwa-installability), [web.dev richer install UI](https://web.dev/patterns/web-apps/richer-install-ui) | Manifest completo + 3 capturas por idioma. **Medido**: `Page.getInstallabilityErrors` do Chromium devolve lista vazia. |
| Apagão do WebKit | O ITP apaga cookies e todo armazenamento gravável por script (IndexedDB, localStorage, Cache do service worker) de sites sem interação por 7 dias; **apps na Tela de Início são isentos** do corte. | [webkit.org/tracking-prevention](https://webkit.org/tracking-prevention/), [fórum Apple](https://developer.apple.com/forums/thread/710157) | Aviso específico no iPhone sem instalar ("instale na Tela de Início e faça backup"); o lembrete de backup já tinha o gatilho de 5 dias no WebKit. |
| `storage.persist()` | Pedido de armazenamento persistente; o navegador decide (heurística) e muitas vezes recusa sem prompt. No Safari 17+ a concessão depende, entre outros fatores, de ser app da Tela de Início. Não é defesa documentada contra o ITP. | [selfstore.dev](https://selfstore.dev/blog/browser-storage-is-not-durable), [fórum Apple](https://developer.apple.com/forums/thread/710157) | Pedir depois do 1º registro, não no 1º quadro; **dizer a verdade** quando recusar (a única garantia é o backup). |
| iOS não tem prompt | Só Android/Chromium dispara `beforeinstallprompt`. | MDN / web.dev | Instrução explícita (Compartilhar → Adicionar à Tela de Início) no iOS; botão nativo só quando o evento chegou. |
| Capacitor no iOS | O WKWebView não suporta service worker no esquema `capacitor://`; o IndexedDB do WebView pode ser reclamado pelo sistema com pouco espaço. | [capacitor#7069](https://github.com/ionic-team/capacitor/issues/7069), [capacitor#5502](https://github.com/ionic-team/capacitor/discussions/5502), [guia Storage](https://capacitorjs.com/docs/guides/storage) | Casca nativa **não** registra SW (o pacote já contém tudo); backup continua sendo a garantia nos dois mundos. |
| Notificação local | Android 13+ exige permissão `POST_NOTIFICATIONS`; o plugin 8.3+ pede a permissão ao agendar. | [capacitorjs.com local-notifications](https://capacitorjs.com/docs/apis/local-notifications) | Pedir só quando a pessoa **liga** o lembrete; negada = mensagem clara, nada agendado. |
| Apple 4.2 | "Minimum functionality": site embrulhado é recusado; o que convence é capacidade nativa visível já no primeiro minuto, não só push. | [mobiloud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper/), [storeshot](https://storeshot.ai/blog/guideline-4-2-minimum-functionality/) | Ver "O que o app tem de nativo" em `docs/app-nativo.md`: funciona 100% offline do pacote, lembretes locais, háptico, folha de compartilhar para o backup. |
| Google Play | A partir de 31/08/2026, novos apps e atualizações precisam mirar Android 16 (API 36) e vir em AAB. | [Play Console Help](https://support.google.com/googleplay/android-developer/answer/11926878), [median.co](https://median.co/blog/google-plays-target-api-level-requirement-for-android-apps) | **Medido**: `cap add android` do Capacitor 8.5.2 gera `targetSdkVersion = 36`, `compileSdk = 36`, `minSdk = 24`. |
| TWA / assetlinks | A verificação depende de a impressão SHA-256 do `assetlinks.json` bater com a chave que **a Play usa para assinar** (Play App Signing), não só a de upload. Colocar as duas é o conserto comum. | [Bubblewrap #604](https://github.com/GoogleChromeLabs/bubblewrap/issues/604), [guia de rejeição TWA](https://12-testers-for-14-days.github.io/guides/twa-app-rejected-switch-to-webview/) | Exemplo com as duas impressões em `mobile/twa/assetlinks.example.json`, sem valor inventado. |

## Decisões e o porquê

1. **Pré-cache de TUDO, versionado pelo conteúdo.** O requisito é "todas as telas offline". Pré-cachear só o shell e deixar as telas para
   stale-while-revalidate falharia exatamente na tela que a pessoa nunca abriu antes de perder o sinal. Custo medido: 125 arquivos, 980 KB
   (fontes e ícones inclusos), baixados uma vez. O hash é do conteúdo (`fitrich_plataforma.py`): esquecer de rodar o build reprova o teste.
2. **Stale-while-revalidate só para o que NÃO está na lista**, e num cache do **mesmo hash** da versão. Misturar um arquivo novo com o shell
   velho (módulos ES têm dependências cruzadas) é o pior erro de PWA; cache de execução que morre com a versão impede isso.
3. **Sem `skipWaiting` automático.** Atualização vira faixa "Nova versão disponível", e o reload só acontece por toque na própria aba. Em
   outra aba aberta, só avisa. Dados (IndexedDB) nunca passam pelo worker.
4. **Duas entradas de instalação (pt/en)**, `scope` `/` nas duas. Quem instala pelo `/en/` abre em inglês, e o seletor de idioma não sai do app.
5. **`theme_color` por tema** só é possível pela `<meta name="theme-color">` (o manifest tem uma cor só); `tema.js` e o botão de tema a atualizam.
6. **Capacitor, não só TWA, como caminho principal da loja**: a Apple não aceita TWA, e um único pacote com camada nativa opcional serve as duas lojas.
   O TWA fica documentado como atalho para Android.
7. **Nada de plugin com rede.** Só LocalNotifications, Haptics, Share e Filesystem (para escrever o arquivo temporário do backup antes de compartilhar).

## O que NÃO foi pesquisado ou provado (honestidade)

- Nada foi rodado em aparelho real nem em emulador Android/iOS (o container não tem SDK). Provado: toolchain do Capacitor (`cap add android` + `cap sync` +
  `capacitor-assets`) num diretório temporário, e o app web inteiro em Chromium. O comportamento dentro do WebView nativo (ponte do Capacitor sob CSP,
  permissão de notificação, `Capacitor.Plugins` sem bundler) é **hipótese documentada**, com checklist de teste no aparelho em `app-nativo.md`.
- Políticas das lojas mudam; a checklist cita a regra e a data da leitura (2026-10-05).
