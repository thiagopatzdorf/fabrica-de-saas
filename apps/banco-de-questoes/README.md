# Banco de Questões

A free question bank for Brazilian public-service exams ("concursos"): solve questions by subject, track progress per subject, and get a transparent "chance of passing" estimate. Next.js 15, TypeScript, Prisma 6 + PostgreSQL, Auth.js v5 (Google and magic link), Tailwind 4, Zod. The bundled seed is fictional; bring your own (licensed) question content.

Banco de questões gratuito para concursos públicos, com progresso por matéria e uma estimativa explicável de "chance de passar".

## Recursos

- Lista de concursos, com matérias e o peso de cada uma no edital.
- Resolução de questões com gabarito e explicação. O gabarito só é revelado depois da resposta (conferido no servidor, em `answerQuestion`).
- Progresso por concurso e por matéria.
- "Minha chance": média ponderada simples (não é machine learning), em `src/lib/prediction.ts`.
- Login com Google ou link mágico por e-mail.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind CSS 4, componentes no padrão shadcn/ui (`src/components/ui`), PostgreSQL via Prisma 6, Auth.js v5, Zod, Vitest.

## Como rodar

Requer Node 20+ e um PostgreSQL acessível.

```bash
cp exemplo.env .env      # ajuste DATABASE_URL, DIRECT_URL e AUTH_SECRET
npm install
npm run db:push           # cria as tabelas
npm run db:seed           # 3 concursos fictícios, 60 questões fictícias
npm run dev               # http://localhost:3000
```

`DATABASE_URL` e `DIRECT_URL` podem ser a mesma URL (`DIRECT_URL` só importa com pooler). Gere o `AUTH_SECRET` com `npx auth secret`.

Não há `docker-compose` aqui: suba o Postgres como preferir (instalação local, container etc.).

## Autenticação

- **Google:** crie um OAuth Client ID no console do Google Cloud, com redirect `http://localhost:3000/api/auth/callback/google`, e preencha `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`.
- **Link mágico:** preencha `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` e `EMAIL_FROM` com um servidor SMTP. O e-mail digitado é validado e normalizado (minúsculas, sem espaços) antes do envio.
- As páginas públicas e o seed funcionam sem login; responder questões exige sessão.

## Testes

```bash
npm test            # vitest: 29 testes, sem banco
npm run typecheck   # tsc --noEmit
npm run lint
npm run build       # precisa de DATABASE_URL (qualquer valor serve para compilar)
```

Os testes cobrem a lógica pura: chance de passar (`src/lib/prediction.test.ts`), agregação de progresso (`src/lib/progress.test.ts`) e validações Zod (`src/lib/validation.test.ts`). Não há testes de integração com banco nem de interface.

## Modelo de "chance de passar"

```
chance = acertoPonderado * 0.6 + volume * 0.25 + consistência * 0.15
```

- `acertoPonderado`: metade acerto geral, metade acerto por matéria ponderado pelo peso no edital (matéria não praticada conta 0%).
- `volume`: questões respondidas / 150 (satura em 100%).
- `consistência`: acerto nas últimas 20 respostas.

Os pesos ficam em `PREDICTION_WEIGHTS`. É uma heurística didática, não uma previsão estatística validada.

## Estrutura

```
prisma/schema.prisma     12 modelos (Auth.js + Contest, Subject, ContestSubject, Question, QuestionOption, UserAnswer, UserProgress)
prisma/seed.ts           seed fictício
src/app/                 telas: /, /login, /concursos, /concursos/[slug], /concursos/[slug]/questoes, /progresso, /minha-chance
src/lib/                 prediction, progress, validation (puros, testados), queries, prisma
src/components/          UI (shadcn-style), layout, questões
```

## Limites honestos

- O seed é **fictício**: concursos, órgãos e bancas inventados ("Exemplo"), questões escritas de forma genérica. Não representa nenhum edital real.
- Conteúdo real de questões é responsabilidade de quem opera: provas de bancas costumam ter direitos autorais. Obtenha licença ou escreva as suas.
- A estimativa de chance é uma heurística, não promete aprovação.
- Sem painel administrativo: questões entram por seed/SQL/Prisma.
- `npm audit` ainda acusa avisos nas dependências de auth e banco (`nodemailer`, `@auth/core`/`next-auth` beta, `prisma` 6, `postcss` via Next) cuja correção exige salto de versão maior ou ainda não existe. Revise antes de produção.
- O build foi validado com `next build` e as páginas públicas respondem 200 com Postgres 16 local; o fluxo de login (Google/SMTP) não foi exercitado.

## Licença

MIT (ver LICENSE na raiz).
