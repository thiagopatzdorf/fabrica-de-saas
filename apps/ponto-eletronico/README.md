# Ponto Eletrônico

**English:** A multi-company electronic time clock for the web. Employees clock in from their phone with a GPS geofence
and an on-device face check; HR gets a monthly timesheet ("espelho") as screen, print/PDF and CSV, with audited
adjustments. Runs on a Cloudflare Worker + D1 + Static Assets; face embeddings are computed in the browser with
`@vladmandic/human`. **It is NOT a certified/registered REP-P under Brazilian MTE Portaria 671/2021, and it processes
biometric data (LGPD art. 11). Read the legal notice below before using it with real people.** Docs are in Brazilian
Portuguese.

> ## AVISO LEGAL (leia antes de usar)
>
> - **Isto não é um REP-P homologado.** A Portaria MTP 671/2021 exige, para ponto por programa, registro do software no
>   INPI, atestado técnico do fabricante e geração dos arquivos **AFD/AEJ**. Este projeto **não tem registro no INPI e
>   não gera AFD nem AEJ**. Tem NSR sequencial por empresa, comprovante, hash encadeado e espelho com marcações
>   originais preservadas, o que o torna útil como **controle interno de jornada**, não como sistema de ponto oficial
>   para fins de fiscalização. Não o apresente como REP-P a ninguém.
> - **Dado biométrico é dado pessoal sensível (LGPD, art. 11).** Quem opera o sistema é o **controlador**: o
>   consentimento específico dos funcionários, a base legal, o aviso de privacidade, a definição de retenção/descarte,
>   o atendimento a titulares e o **relatório de impacto (RIPD/DPIA)** são responsabilidade **do operador**, não deste
>   software. O termo exibido no app (`TERMO_VERSAO` em `servidor/worker.js`) é um ponto de partida e precisa de
>   revisão jurídica.
> - **Reconhecimento facial erra** (falsos aceites e falsos recusos) e **pode ser enganado**: o vetor do rosto é
>   calculado no celular, então alguém com conhecimento técnico e um vídeo da pessoa piscando pode burlar a
>   verificação. Os limiares foram calibrados com fotos públicas, não com selfies de campo. Mantenha sempre uma
>   alternativa ao rosto para quem não consentir ou não for reconhecido.
> - **Sem garantia.** Software fornecido "como está" (licença MIT). Uso **por sua conta e risco**.

## Recursos

- **RH** (`/app/`): cadastra locais (coordenadas + raio da cerca) e funcionários (nome, CPF, jornada, local) e gera um
  **link de ativação** por funcionário (7 dias, uso único). Link novo derruba o celular anterior.
- **Funcionário**: abre o link no celular, aceita o termo, pisca quando pedido e tira 3 fotos; o celular manda só os
  vetores do rosto. O servidor confere que as 3 são da mesma pessoa e guarda os vetores e o CPF **cifrados**
  (AES-GCM, chave derivada do `SEGREDO`).
- **Ponto** (`/app/ponto`): localização + desafio de piscar + vetor + foto pequena. O servidor confere a cerca
  (precisão do GPS vale como tolerância, até 100 m) e o rosto; grava com NSR e hash encadeado por funcionário.
- **Espelho** (`/app/espelho`): marcações do mês por dia, trabalhado, previsto, saldo, faltas, ímpares, fora da cerca
  e "rosto a revisar"; foto de cada marcação; **incluir** e **desconsiderar** com motivo (a original nunca é apagada);
  **Imprimir/PDF** e **CSV** (com neutralização de fórmulas do Excel).
- **Auditoria**: toda ação, inclusive ponto recusado, vira linha que só cresce.
- **Multiempresa**: um banco para várias empresas, isoladas por `empresa` em toda consulta.
- Tema claro/escuro, sem dependências de execução no servidor (Worker em ES modules puros).

## Como rodar local

Requisitos: **Node >= 22.5** (usa `node:sqlite` no lugar do D1) e `tar`.

```bash
node scripts/baixar-modelos.mjs     # 1 vez: biblioteca de rosto + modelos (veja "Modelos" abaixo)
node servidor/servir-local.mjs      # http://localhost:8790, banco em memória
```

O comando imprime o **link de instalação** (`/app/instalar#...`): abra-o para criar a empresa e o acesso do RH.
Sem `SEGREDO` no ambiente nasce um aleatório a cada execução. Para guardar o banco: `BANCO=ponto.sqlite SEGREDO=<fixo>`.
Câmera e localização exigem `localhost` ou HTTPS. Sem rodar `baixar-modelos`, a API funciona mas a tela de rosto não.

## Modelos de rosto (não embutidos)

`scripts/baixar-modelos.mjs` baixa `@vladmandic/human@3.3.6` (MIT) do npm, confere o SHA-256 de cada arquivo e copia
`human.esm.js` e os modelos para `site/app/`. A licença do peso `antispoof` não pôde ser confirmada, por isso nada
disso vai no Git. Detalhes e licenças: [THIRD_PARTY.md](THIRD_PARTY.md).

## Deploy (Cloudflare, com `wrangler`)

```bash
node scripts/baixar-modelos.mjs
cp wrangler.toml.example wrangler.toml
npx wrangler d1 create ponto-eletronico            # copie o database_id impresso para wrangler.toml
npx wrangler d1 execute ponto-eletronico --remote --file servidor/schema.sql
openssl rand -hex 32 | npx wrangler secret put SEGREDO
npx wrangler deploy
```

**Guarde o `SEGREDO`:** trocá-lo torna ilegíveis os rostos e CPFs já cadastrados e invalida convites. Aplique o
`schema.sql` uma vez (ele é a fonte do esquema); mudanças futuras exigem migração sua.

**Cliente novo** (link de 72 h, uso único, cria a empresa e o acesso do RH):

```bash
SEGREDO=<o mesmo do Worker> node scripts/convite.mjs https://seu-dominio.exemplo
```

Não há cobrança embutida: se for vender como serviço, integre o seu meio de pagamento por fora do Worker.

## Testes

```bash
node --test servidor/worker.test.mjs servidor/higiene.test.mjs
```

O primeiro cobre regras (CPF, CNPJ, cerca, semelhança), fluxo completo com banco SQLite, limites de tentativa, CSRF,
isolamento entre empresas, espelho/CSV e o gerador de convites; o segundo impede o retorno de marca, cobrança,
modelos embutidos e CSP frouxa.

## Variáveis e bindings

| nome | onde | para quê |
|---|---|---|
| `SEGREDO` | secret do Worker / ambiente local | cifra CPF e rosto, assina convites e sessões, gera hash de IP. Sem ele a API responde 503 (falha fechada) |
| `DB` | binding D1 | banco |
| `ASSETS` | binding de Static Assets | pasta `site/` |
| `PORT`, `BANCO` | só `servir-local.mjs` | porta (8790) e arquivo SQLite |
| `empresas.limiar`, `limiar_revisao`, `real_minimo`, `exigir_piscar` | colunas por empresa | limiares de rosto (0,55 / 0,42 / 0,45 / piscar ligado) |

## Estrutura

```
servidor/   worker.js (API), src/ (regras, espelho, cripto), schema.sql, servir-local.mjs, testes
site/       app/ (RH, espelho, ativação, ponto), estilo.css, tema.js, _headers (CSP)
scripts/    convite.mjs, baixar-modelos.mjs
third_party/LICENSE-human.txt
```

## Limites honestos

- Sem AFD/AEJ, sem registro no INPI, sem integração com folha. Fuso fixo de Brasília (UTC-3).
- Calibração de rosto feita com 19 rostos públicos (171 pares) e câmera simulada; semelhança entre pessoas diferentes
  chegou a 0,49 com malha facial e 0,71 sem. Faça sua própria calibração com selfies reais.
- O score de "vivacidade" não serve como trava (foto parada deu 1,0); a defesa é o desafio de piscar, que é burlável.
- Estado: beta, sem auditoria de segurança independente. Antes de produção, rode a sua e faça o RIPD.
- O GPS do celular pode ser falsificado pelo usuário; a foto de cada marcação existe para tornar isso visível.

Licença: MIT (ver LICENSE na raiz).
