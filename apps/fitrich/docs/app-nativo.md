# Fitrich como app de loja (Android e iOS)

Estado em 2026-10-05: **tudo pronto para gerar o pacote, nada publicado**. Não há conta de loja, chave de assinatura nem gasto envolvidos neste
repositório. Quem publica segue os passos abaixo na própria máquina. Pesquisa e fontes: `docs/pesquisa-app.md`.

## Dois caminhos, uma escolha

| | PWA instalável (já no ar) | Capacitor (casca nativa) | TWA (só Android) |
|---|---|---|---|
| Onde | Navegador, "Instalar app" / Tela de Início | Google Play + App Store | Google Play |
| Custo | zero | conta Apple (paga, anual) e Google Play (paga, única), **decisão de quem publica** | conta Google Play |
| Offline | service worker (provado) | tudo dentro do pacote | service worker via Chrome |
| Extras nativos | não | lembretes locais, háptico, folha de compartilhar | não |
| Pasta | `app/` | `mobile` | `mobile/twa` |

Recomendação: **Capacitor** para as duas lojas (a Apple não aceita TWA). TWA só se quiser sair rápido no Android com o mesmo site.

## O que o app tem de nativo (resposta à regra 4.2 da Apple e à política de funcionalidade mínima da Play)

Detectado em tempo de execução por `js/v2/plataforma/nativo.mjs`; no navegador tudo isso some sem erro e o app segue como PWA.

1. **Funciona 100% sem internet de verdade**: todos os arquivos vão dentro do pacote (não carrega site remoto; `server.url` não existe na config e há teste que impede).
2. **Lembretes locais** (LocalNotifications): lembrete diário para lançar os gastos, na hora que a pessoa escolhe, e lembrete mensal de backup. Disparam com o app fechado, sem servidor.
3. **Háptico** ao confirmar um lançamento.
4. **Folha de compartilhar do sistema** para o backup (cifrado ou não): salva em Arquivos/Drive/e-mail. `<a download>` não funciona no WebView do iOS, então sem isso o backup nem sairia do app.
5. **Permissões mínimas**: só notificações, e só quando a pessoa liga o lembrete. `INTERNET` e alarme exato podem ser removidos (`scripts/endurecer-android.mjs`).
6. Experiência de app: tela cheia, ícone adaptativo/monocromático, splash com tema, safe-area/entalhe, atalhos "Lançar gasto" e "Registrar treino".

Risco honesto: a Apple pode ainda assim pedir mais "nativo". Plano B (nesta ordem, cada um pequeno): widget/atalho de lançamento rápido (App Intents),
Face ID/biometria para abrir o app (plugin de biometria local), exportar para Saúde/Health Connect. Nada disso foi construído; só entra se houver recusa.

## Pré-requisitos

- Node 22+ (o Capacitor 8 exige) e `python3` com Pillow (só para gerar ícones).
- Android: Android Studio + JDK 21 (o Gradle do template pede). iOS: **um Mac** com Xcode atual e CocoaPods.
- Conta de desenvolvedor da loja (decisão e custo de quem publica; este repositório não usa nem guarda credencial).

## Android (AAB para a Play)

Da raiz do projeto, `cd mobile`:

    npm install
    npm run android:add          # monta www/ do app web e cria android/ (targetSdk 36 medido)
    npm run recursos             # ícones e splash a partir da identidade do favicon
    node scripts/endurecer-android.mjs   # tira INTERNET e alarme exato; TESTE no aparelho depois
    npm run android:abrir        # Android Studio

No Android Studio / Gradle:

1. `versionCode` (inteiro que só sobe) e `versionName` em `android/app/build.gradle`. A cada versão nova, suba o `versionCode`.
2. Chave de **upload**: `keytool -genkeypair -v -storetype PKCS12 -keystore fitrich-upload.keystore -alias fitrich-upload -keyalg RSA -keysize 2048 -validity 10000`.
   Guarde o `.keystore` e a senha **fora do git** (o `.gitignore` já barra `*.keystore`). Perder a chave de upload é recuperável pela Play; perder a de app sem Play App Signing não.
3. Ligue **Play App Signing** (padrão para apps novos): a Google guarda a chave final e você assina com a de upload.
4. Gere o bundle: `npm run android:aab` (resultado em `android/app/build/outputs/bundle/release/app-release.aab`, assinar via `signingConfigs` ou pelo Android Studio > Build > Generate Signed Bundle).
5. Play Console: crie o app, envie o `.aab` na trilha **Teste interno** primeiro, depois produção.

Contas novas pessoais da Play exigem teste fechado com testadores por um período antes da produção: confira a regra vigente no Console, pode mudar.

### Teste no aparelho (não foi possível aqui: sem emulador no container)

- [ ] O app abre em modo avião e mostra todas as telas.
- [ ] Depois do `endurecer-android.mjs`: continua abrindo (se não abrir, desfaça a remoção de INTERNET e registre o achado).
- [ ] Lançar um gasto dá toque háptico.
- [ ] "Meu app" > ligar lembrete diário pede permissão (Android 13+), agenda, e a notificação chega na hora marcada (inexata: pode atrasar alguns minutos).
- [ ] Dados > exportar abre a folha de compartilhar com o arquivo; importar o mesmo arquivo de volta restaura.
- [ ] Atalho do ícone (segurar o ícone) não é do Capacitor: é do manifest da PWA e **não existe** no app nativo; não prometer na ficha.
- [ ] Rotação, tema claro/escuro e entalhe (conteúdo não fica sob a barra de status).

## iOS (precisa de Mac)

    cd mobile && npm install
    npm run ios:add              # cria ios/ (CocoaPods)
    npm run recursos             # ícones e splash
    npm run ios:abrir            # Xcode

No Xcode:

1. Target App > Signing & Capabilities: escolha o Team, Bundle Identifier `com.example.fitrich`, "Automatically manage signing".
2. Versão/Build em General (Build sobe a cada envio).
3. Capabilities: **nenhuma** extra (sem Push, sem iCloud). As notificações locais não exigem capability.
4. `Info.plist`: nada de `NSUserTrackingUsageDescription` (o app não rastreia). Os plugins usados não pedem texto de permissão além do que o sistema mostra para notificações.
5. Privacy manifest (`PrivacyInfo.xcprivacy`): o Capacitor 8 já inclui o dele; declare **sem coleta de dados** e sem domínios de rastreio. Confira o relatório do Xcode em Product > Archive > Generate Privacy Report.
6. Product > Archive > Distribute App > App Store Connect > TestFlight primeiro.

Atenção a iOS: o WKWebView não tem service worker (o app nativo dispensa) e o sistema pode reclamar o IndexedDB do WebView com pouco espaço: por isso **o lembrete de backup importa mais ainda** e o app avisa.

### Teste no aparelho (iOS)

- [ ] Abre em modo avião, todas as telas. [ ] Tema/idioma persistem. [ ] Lembrete local dispara com o app fechado.
- [ ] Exportar backup abre a folha de compartilhar e "Salvar em Arquivos" funciona. [ ] Conteúdo não fica sob o entalhe / Dynamic Island.

## TWA (alternativa só Android, sem Capacitor)

Usa o site no ar dentro do Chrome em tela cheia. Pré-requisito: `https://fitrich.example.com` publicado com o service worker e o `_headers` (ver "Deploy").

    npm i -g @bubblewrap/cli
    bubblewrap init --manifest https://fitrich.example.com/manifest.webmanifest   # ou parta de mobile/twa/twa-manifest.example.json
    bubblewrap build        # gera o .aab e um assetlinks.json parcial

Ou pelo PWABuilder (pwabuilder.com): cole a URL, escolha Android, baixe o pacote.

**Digital Asset Links** (obrigatório, senão o app abre com barra de endereço do Chrome): publique `https://fitrich.example.com/.well-known/assetlinks.json`
com **as duas** impressões SHA-256: a da chave de upload e a de assinatura do app que a Play mostra em Console > Integridade do app > Assinatura de apps.
Modelo: `mobile/twa/assetlinks.example.json` (as impressões do modelo são marcadores e o teste exige que continuem marcadores no repo).
Para publicar no site, a pasta `.well-known/` vai dentro de `app/` (precisa de decisão de risco alto: muda o que o CD publica). Verifique com a
[ferramenta de Digital Asset Links](https://developers.google.com/digital-asset-links/tools/generator) da Google.
TWA com mesmo `packageId` do Capacitor: **escolha um dos dois** por app na Play.

## Ficha da loja

**Nome**: Fitrich: finanças e shape (limite de 30 caracteres no Android: "Fitrich: finanças e shape" tem 24).
**Subtítulo / descrição curta** (80): "Gastos, metas e treinos num app só. Sem conta, sem internet, só no seu aparelho."
**Descrição longa (pt-BR)**:

> O Fitrich mostra quanto dá para gastar até o fim do mês e junta, num só lugar, seus gastos, cartões, metas, dívidas, peso e treinos.
> Lance um gasto em três toques, importe o extrato do banco (OFX ou CSV) e acompanhe o mês sem planilha.
> Seus dados ficam só no seu aparelho: não pede cadastro, não tem anúncios e não envia nada a ninguém. Faça backup cifrado com uma senha que só você conhece.
> Ferramenta de acompanhamento pessoal; não é aconselhamento médico, nutricional, financeiro nem de investimento.

**Long description (en)**:

> Fitrich shows how much you can spend until the end of the month and brings spending, cards, goals, debts, weight and workouts into one place.
> Log an expense in three taps, import your bank statement (OFX or CSV) and follow the month without a spreadsheet.
> Your data stays only on your device: no sign-up, no ads, nothing sent to anyone. Make an encrypted backup with a password only you know.
> A personal tracking tool; not medical, nutritional, financial or investment advice.

**Palavras-chave (iOS, 100 caracteres)**: finanças,orçamento,gastos,metas,treino,peso,cartão,dívidas,offline,privacidade
**Categoria**: Finanças (principal); Saúde e fitness (secundária).
**Capturas**: geradas do app real em modo exemplo por `mobile/scripts/capturas-loja.mjs` (780x1688 no repositório; a Apple pede tamanhos de aparelho
específicos, refaça no simulador do tamanho exigido: iPhone 6,9", iPad se declarar suporte).
**URL da política de privacidade**: `https://fitrich.example.com/privacidade/` (inglês: `/en/privacy/`), fonte em `scripts/fitrich_build.py`.
**Contato de suporte**: **falta definir** o e-mail (as lojas exigem). A política do código-fonte não traz contato; coloque o seu e-mail em `scripts/fitrich_build.py` (seção "Mudanças e contato") antes de enviar.
**Direitos autorais / licença**: MIT (LICENSE da raiz do repositório); `mobile/package.json` declara `MIT`.

## Privacidade e classificação

- **Google Play, Segurança dos dados**: "Este app não coleta nem compartilha dados do usuário" (nenhum SDK, nenhuma rede). Dados criptografados em trânsito: não se aplica (sem trânsito).
  Permissão de exclusão de dados: o usuário apaga tudo em Dados > Apagar.
- **App Store, Privacidade do app**: "Dados não coletados". Sem rastreamento (ATT não se aplica).
- **Classificação etária**: questionário IARC (Play) e o da Apple: sem conteúdo gerado por usuário compartilhado, sem violência, sem apostas, sem compras. Resultado esperado:
  Livre / 4+. O app trata finanças e peso do próprio usuário, mas sem aconselhamento; o aviso "não é aconselhamento" já está no rodapé.
  Declare "Finanças" corretamente: **não** oferece empréstimo, pagamento nem corretagem (isso mudaria as exigências).
- Saúde: peso e treinos são registro pessoal sem diagnóstico; não declarar app médico.

## Checklist de revisão

Apple (App Store Review Guidelines): [ ] 2.1 app completo, sem placeholder (as telas "em breve" não existem mais) [ ] 4.2 funcionalidade além de site (seção acima) [ ] 5.1.1 política de privacidade
com URL ativa e dentro do app (rodapé "Privacidade") [ ] 5.1.1(v) exclusão de dados: botão Apagar tudo [ ] 3.1 sem compra no app [ ] conta de teste: **não há login**, escreva isso nas notas de revisão e
mencione o "modo exemplo" (Hoje > dados de exemplo) para o revisor ver telas cheias [ ] nenhuma menção a outra plataforma nas imagens.
Google Play: [ ] target API 36 (medido no template) [ ] AAB [ ] Segurança dos dados preenchida [ ] política de privacidade URL [ ] declaração de permissões (só notificações) [ ] funcionalidade mínima: ver "O que o app tem de nativo" [ ] público-alvo e conteúdo (não é app infantil).

## Deploy do site (PWA) e `_headers`

Este repositório **não faz deploy**. O `_headers` (CSP estrita, `img-src 'self' data: blob:` para fotos locais, `connect-src 'none'`) e o service worker só valem depois da publicação. Quem publica:

    # 1. conferir localmente (sem rede)
    python3 scripts/fitrich_build.py && python3 scripts/fitrich_plataforma.py build
    FITRICH_BASE_URL=https://seu-dominio.exemplo python3 scripts/fitrich_build.py   # canonical, hreflang, sitemap
    npm test
    # 2. publicar a pasta app/ em qualquer hospedagem estática (HTTPS) que respeite o arquivo _headers,
    #    e conferir no ar que o Content-Security-Policy chegou

Rollback do service worker se algo sair errado: publicar um `sw.js` que se desregistra (`self.registration.unregister()` no `activate` e `caches.delete` dos `fitrich-*`);
os dados do usuário (IndexedDB) não são tocados.

## Manutenção a cada versão

1. Mexeu no app web? `python3 scripts/fitrich_build.py` e `python3 scripts/fitrich_plataforma.py build` (regenera páginas, manifests e a lista do pré-cache; o teste falha se esquecer).
2. Para a loja: `cd mobile && npm run sync`, suba `versionCode`/Build, gere o pacote.
3. O app web e o pacote nativo compartilham o mesmo código: não existe "versão nativa" do código de telas.
4. Fotos locais (tela Corpo) usam `blob:` na CSP; o pacote nativo não tem CSP por padrão (`montar-www.mjs --csp` a liga; teste no aparelho antes).
