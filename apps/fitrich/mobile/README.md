# Fitrich — casca nativa (Capacitor)

Empacotamento do Fitrich (app web local-first) como app Android e iOS com Capacitor, sem rede e com lembretes locais opcionais.

| | |
|---|---|
| **Stack** | Capacitor 8 (Node 22) em volta do app estático de `../app/`; scripts em Node e Python (Pillow só para ícones) |
| **Rodar** | `cd mobile && npm install && npm run android:add` (ou `ios:add` num Mac); `npm run montar` só monta `www/` |
| **Testar** | `npm test` na raiz do projeto (inclui `tests/unit/fitrich-app-nativo.test.mjs`) |
| **Deploy** | não há: publicação nas lojas é manual, passo a passo em `../docs/app-nativo.md` (conta de desenvolvedor e assinatura são de quem publica) |
| **Estado** | pronto para gerar o pacote; nada publicado e nada testado em aparelho |

O código das telas é um só (o de `../app/`). Esta pasta tem só o que a casca precisa: `capacitor.config.json`, o montador do `www/`
(`scripts/montar-www.mjs`), os recursos de ícone e abertura (`assets/`), o endurecimento do manifesto Android
(`scripts/endurecer-android.mjs`) e os modelos do caminho alternativo TWA (`twa/`). Os projetos `android/` e `ios/` são gerados por
quem publica e não são versionados (`.gitignore`). O `appId` (`com.example.fitrich`) é um valor de exemplo: troque pelo seu
em `capacitor.config.json` antes de publicar. Guia completo: `../docs/app-nativo.md`.
