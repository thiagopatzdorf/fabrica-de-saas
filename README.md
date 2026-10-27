<!-- gerado por scripts/gerar.py; não edite à mão (ver AGENTS.md). Fontes: catalogo/*.yml, catalogo/verificado.json, apps/apps.yml -->

# Fábrica de SaaS

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**O catálogo verificado de SaaS open source, lido por pessoas e por agentes de IA, mais 9 produtos nossos prontos para usar (MIT).**

**The verified catalog of open source SaaS, read by humans and AI agents, plus 9 products of our own, ready to use (MIT).**

Hoje: **836** projetos em **37** categorias, alternativas a **545** SaaS proprietários (817 ativos, 19 sem push há mais de 18 meses). Licença, estrelas e atividade são conferidas direto no GitHub (última verificação: 2026-10-27); repositório arquivado, sem licença clara ou com licença fora da [lista aceita](LICENSE-POLICY.md) fica de fora.

Today: **836** projects in **37** categories, alternatives to **545** proprietary SaaS tools (817 active, 19 with no push in over 18 months). License, stars and activity are checked straight from GitHub (last check: 2026-10-27); archived repos, unclear licenses and licenses outside the [accepted list](LICENSE-POLICY.md) are left out.

O catálogo só **aponta** para os projetos: nenhum código ou texto de terceiros é copiado (ver [NOTICE.md](NOTICE.md)). / The catalog only **links** to projects: no third-party code or text is copied.

## Para agentes / For agents

- [`AGENTS.md`](AGENTS.md): mapa dos arquivos, formato de entrada e comandos exatos. / file map, input format and exact commands.
- [`llms.txt`](llms.txt) e [`llms-full.txt`](llms-full.txt): o catálogo em texto compacto, uma linha por projeto. / the catalog as compact text, one line per project.
- [`catalogo.json`](catalogo.json) e [`catalogo.csv`](catalogo.csv): dados estruturados; esquema em [`schema/saas.schema.json`](schema/saas.schema.json). / structured data.
- Arquivos gerados nunca se editam à mão: mude `catalogo/*.yml` e rode `python3 scripts/gerar.py`. / generated files are never edited by hand.

## Código nosso / Our code

9 produtos nesta árvore, em [`apps/`](apps), cada um roda sozinho e tem testes (1048 no total, medidos no dia da publicação). / 9 products in this tree, each runs on its own and has tests (1048 in total).

| # | Produto | O que faz | Stack | Testes |
|---:|---|---|---|---:|
| 1 | [`gestao-juridica`](apps/gestao-juridica) | Escritório de advocacia: processos (CNJ validado), prazos pelo CPC, agenda, documentos com versões, alertas e login com papéis. | Python, FastAPI, SQLite | 129 |
| 2 | [`links-de-pagamento`](apps/links-de-pagamento) | Links de pagamento no seu Stripe (valor fixo, livre, mensal; Pix, cartão, parcelado), checkout com a sua marca e webhook assinado. | Cloudflare Worker, KV | 62 |
| 3 | [`loja-minima`](apps/loja-minima) | Loja pequena: vitrine, carrinho, checkout, painel do dono e frete; o preço é sempre recalculado no servidor. | Cloudflare Worker, KV | 43 |
| 4 | [`hub-de-marketplaces`](apps/hub-de-marketplaces) | Hub de e-commerce multicanal: catálogo, preço, estoque, anúncios e pedidos. Os adaptadores de canal são SIMULADOS. | TanStack Start, Postgres, Better Auth | 42 |
| 5 | [`fitrich`](apps/fitrich) | Finanças pessoais e treino/nutrição, 100% no aparelho (PWA, sem backend), em português e inglês. | JavaScript, IndexedDB | 592 |
| 6 | [`banco-de-questoes`](apps/banco-de-questoes) | Banco de questões para concursos, com progresso por matéria e "chance de passar". | Next.js, Prisma, Postgres, Auth.js | 29 |
| 7 | [`kanban-de-equipe`](apps/kanban-de-equipe) | Kanban, projetos, equipe e financeiro leve; sincroniza Issues do GitHub e traz servidor MCP para agentes de IA. | Node, Express, MongoDB, MCP | 62 |
| 8 | [`pdv-restaurante`](apps/pdv-restaurante) | PDV de restaurante: mesas, comandas, cozinha, caixa e divisão de conta. | HTML, JavaScript | 14 |
| 9 | [`migracao-de-legado`](apps/migracao-de-legado) | Kit para tirar sistema legado do lugar: lê Delphi ou Laravel, escreve o contrato de regras e gera o app novo. | Python | 75 |

Cada pasta de `apps/` tem README próprio (em inglês e português) / each folder has its own bilingual README.

## Destaques / Highlights

- **[Umami](https://github.com/umami-software/umami)** (Analytics de produto e web, MIT, ★ 39.7k, substitui Google Analytics, Mixpanel): Analytics de sites focado em privacidade, com eventos, funis, retenção e painel simples.
- **[Plausible](https://github.com/plausible/analytics)** (Analytics de produto e web, AGPL-3.0, ★ 29.7k, substitui Google Analytics): Analytics de sites leve e sem cookies, com painel de uma página e metas de conversão.
- **[Saleor](https://github.com/saleor/saleor)** (E-commerce e PDV, BSD-3-Clause, ★ 23.5k, substitui Shopify Plus, BigCommerce): Plataforma de e-commerce headless com API GraphQL, multicanal, multimoeda e painel administrativo.
- **[Ghost](https://github.com/TryGhost/Ghost)** (E-mail marketing e newsletter, MIT, ★ 55.6k, substitui Substack, Medium, Beehiiv): Plataforma de publicação com assinaturas pagas e envio de newsletter por e-mail integrados ao site.
- **[listmonk](https://github.com/knadh/listmonk)** (E-mail marketing e newsletter, AGPL-3.0, ★ 24.0k, substitui Mailchimp, Sendinblue): Servidor de newsletters e listas de e-mail em um binário só, com campanhas, segmentos, templates e métricas.
- **[ERPNext](https://github.com/frappe/erpnext)** (ERP, contabilidade e finanças, GPL-3.0, ★ 40.6k, substitui SAP Business One, NetSuite): ERP completo para pequenas e médias empresas: contabilidade, estoque, produção, vendas, compras e projetos.
- **[Fider](https://github.com/getfider/fider)** (Feedback, roadmap e changelog, AGPL-3.0, ★ 4.6k, substitui Canny, UserVoice): Quadro público onde clientes sugerem e votam ideias, e a equipe responde e acompanha o andamento.
- **[Appsmith](https://github.com/appsmithorg/appsmith)** (Low-code e bancos de dados visuais, Apache-2.0, ★ 41.1k, substitui Retool): Monta painéis e ferramentas internas arrastando widgets e ligando a bancos e APIs com JavaScript.
- **[Postiz](https://github.com/gitroomhq/postiz-app)** (Marketing, redes sociais e SEO, AGPL-3.0, ★ 38.6k, substitui Buffer, Hootsuite, Later): Agendador de posts para várias redes sociais, com calendário, equipe, análises e geração de texto por IA.
- **[Frappe HR](https://github.com/frappe/hrms)** (RH, ponto e folha, GPL-3.0, ★ 9.0k, substitui BambooHR, Gusto, Totvs RH): Sistema de RH completo: cadastro, férias, presença, despesas, folha e avaliações.
- **[Kimai](https://github.com/kimai/kimai)** (RH, ponto e folha, AGPL-3.0, ★ 5.1k, substitui Toggl Track, Clockify, Harvest): Controle de horas por projeto e cliente, com relatórios, faturamento e API.
- **[OpenClockwork](https://github.com/patrickschiller/openclockwork)** (RH, ponto e folha, Apache-2.0, ★ 13, substitui Pontomais, Clockify): Registro de ponto e presença da equipe em app web, simples de subir com Docker.
- **[OpenEMR](https://github.com/openemr/openemr)** (Saúde e clínicas, GPL-3.0, ★ 5.6k, substitui Epic, athenahealth): Prontuário eletrônico e gestão de consultórios com agenda, receitas, faturamento e portal do paciente.
- **[Medplum](https://github.com/medplum/medplum)** (Saúde e clínicas, Apache-2.0, ★ 2.8k, substitui Epic, Redox): Plataforma de desenvolvimento de saúde com servidor FHIR, autenticação, automações e apps clínicos.
- **[Uptime Kuma](https://github.com/louislam/uptime-kuma)** (Status page e uptime, MIT, ★ 93.0k, substitui UptimeRobot, Pingdom): Monitor de disponibilidade com painel bonito, muitos tipos de checagem e avisos por dezenas de canais.

## Catálogo / Catalog

Uma página por categoria, com tabela de licença, estrelas, atividade e stack. / One page per category.

- [Agendamento e calendário](catalogo/agendamento-calendario.md) / Scheduling and calendar: ativos 15, parados 2
- [Analytics de produto e web](catalogo/analytics-produto-web.md) / Product and web analytics: ativos 18, parados 0
- [Arquivos, escritório e colaboração](catalogo/arquivos-office-colaboracao.md) / Files, office and collaboration: ativos 21, parados 0
- [Atendimento e helpdesk](catalogo/atendimento-helpdesk.md) / Support and helpdesk: ativos 10, parados 1
- [Ativos, ITSM, logística e frota](catalogo/ativos-itsm-logistica.md) / Assets, ITSM, logistics and fleet: ativos 15, parados 1
- [Autenticação, identidade e SSO](catalogo/auth-identidade-sso.md) / Authentication, identity and SSO: ativos 41, parados 0
- [Automação e workflows](catalogo/automacao-workflow-ipaas.md) / Automation and workflows: ativos 23, parados 0
- [Backend, APIs e BaaS](catalogo/backend-api-baas.md) / Backend, APIs and BaaS: ativos 34, parados 0
- [BI, dashboards e dados](catalogo/bi-dashboards-dados.md) / BI, dashboards and data: ativos 37, parados 0
- [Chat e comunicação de equipe](catalogo/chat-equipe.md) / Team chat and communication: ativos 12, parados 0
- [CMS, sites e blog](catalogo/cms-sites-blog.md) / CMS, websites and blogs: ativos 33, parados 1
- [Comunidade, fóruns e membros](catalogo/comunidade-foruns-membros.md) / Community, forums and memberships: ativos 25, parados 2
- [Contratos e assinatura eletrônica](catalogo/contratos-assinatura-eletronica.md) / Contracts and e-signature: ativos 6, parados 0
- [CRM e vendas](catalogo/crm-vendas.md) / CRM and sales: ativos 9, parados 0
- [DevOps, CI, erros e feature flags](catalogo/devops-ci-erros-flags.md) / DevOps, CI, error tracking and feature flags: ativos 42, parados 0
- [E-commerce e PDV](catalogo/ecommerce-pdv.md) / E-commerce and POS: ativos 17, parados 2
- [E-mail marketing e newsletter](catalogo/email-marketing-newsletter.md) / Email marketing and newsletters: ativos 11, parados 0
- [ERP, contabilidade e finanças](catalogo/erp-contabilidade-financas.md) / ERP, accounting and finance: ativos 20, parados 0
- [Feedback, roadmap e changelog](catalogo/feedback-roadmap-changelog.md) / Feedback, roadmap and changelog: ativos 4, parados 0
- [Formulários e pesquisas](catalogo/formularios-pesquisas.md) / Forms and surveys: ativos 8, parados 0
- [IA e aplicações de LLM](catalogo/ia-llm-apps.md) / AI and LLM apps: ativos 43, parados 1
- [Imobiliário, hotelaria e reservas](catalogo/imobiliario-hotelaria-reservas.md) / Real estate, hospitality and bookings: ativos 5, parados 0
- [Educação e cursos (LMS)](catalogo/lms-educacao.md) / Education and courses (LMS): ativos 28, parados 1
- [Low-code e bancos de dados visuais](catalogo/low-code-bancos-visuais.md) / Low-code and visual databases: ativos 19, parados 0
- [Marketing, redes sociais e SEO](catalogo/marketing-social-seo.md) / Marketing, social media and SEO: ativos 13, parados 0
- [Mídia, podcast e fotos](catalogo/midia-podcast-fotos.md) / Media, podcasts and photos: ativos 33, parados 1
- [Monitoramento e observabilidade](catalogo/monitoramento-observabilidade.md) / Monitoring and observability: ativos 44, parados 0
- [PaaS, deploy e hospedagem](catalogo/paas-deploy-hospedagem.md) / PaaS, deploy and hosting: ativos 36, parados 0
- [Pagamentos, assinaturas e faturamento](catalogo/pagamentos-assinaturas-faturamento.md) / Payments, subscriptions and billing: ativos 11, parados 1
- [Projetos e tarefas](catalogo/projetos-tarefas.md) / Projects and tasks: ativos 12, parados 0
- [RH, ponto e folha](catalogo/rh-ponto-folha.md) / HR, time & attendance and payroll: ativos 19, parados 1
- [Saúde e clínicas](catalogo/saude-clinicas.md) / Healthcare and clinics: ativos 11, parados 1
- [Segurança, senhas e segredos](catalogo/seguranca-senhas-segredos.md) / Security, passwords and secrets: ativos 40, parados 0
- [Starters e boilerplates de SaaS](catalogo/starters-saas.md) / SaaS starters and boilerplates: ativos 27, parados 0
- [Status page e uptime](catalogo/status-uptime.md) / Status pages and uptime: ativos 16, parados 3
- [Vídeo, reuniões e streaming](catalogo/video-reunioes-streaming.md) / Video, meetings and streaming: ativos 27, parados 0
- [Wiki, documentação e notas](catalogo/wiki-docs-notas.md) / Wiki, docs and notes: ativos 32, parados 1

Números por categoria e por licença: [docs/estatisticas.md](docs/estatisticas.md).

## Como contribuir / Contributing

Para incluir um SaaS, edite **um** arquivo `catalogo/<categoria>.yml` e abra um PR; o CI valida o esquema e a licença é conferida no GitHub. Detalhes e o que será recusado em [CONTRIBUTING.md](CONTRIBUTING.md). / To add a SaaS, edit **one** `catalogo/<category>.yml` and open a PR; CI validates the schema and the license is checked on GitHub. See [CONTRIBUTING.md](CONTRIBUTING.md#english).

## Política de licença / License policy

Entram projetos com licença open source aprovada (lista de 27 identificadores SPDX). Não entram BSL, SSPL, Elastic, Commons Clause nem "fair-code": essas licenças restringem uso ou revenda. Open core entra, marcado. Copyleft (GPL, AGPL) entra porque o catálogo só linka. Tabela completa e motivos em [LICENSE-POLICY.md](LICENSE-POLICY.md). / Only OSI-style open source licenses are listed; source-available and fair-code licenses are not. Open core is listed and flagged.

## Avisos honestos / Honest warnings

- A licença é a que o GitHub informa no momento da verificação; confirme no repositório antes de adotar. / The license is what GitHub reports at check time; confirm in the repo before adopting.
- Estar aqui não é recomendação nem auditoria: ninguém testou cada projeto. / Being listed is neither an endorsement nor an audit.
- Os produtos de `apps/` são código real e testado, mas **nunca auditado por terceiros**; revise dependências, troque todos os segredos de exemplo e rode os testes no seu ambiente. / The `apps/` products are real, tested code, never audited by third parties.
- `gestao-juridica`: a integração com o DataJud nunca foi chamada na API real e não há assinatura ICP-Brasil. / the DataJud integration was never called against the real API and there is no ICP-Brasil signing.
- `links-de-pagamento`: pagamentos só foram exercitados em modo falso; use a chave de teste do Stripe primeiro. / payments were only exercised in fake mode; use the Stripe test key first.
- `loja-minima`: pagamentos só foram exercitados em modo falso; use a chave de teste do Stripe primeiro. / payments were only exercised in fake mode; use the Stripe test key first.
- `hub-de-marketplaces`: os adaptadores ML/Shopee/Amazon/Magalu são simulados; integrar os reais é o próximo passo (docs/adaptadores.md da pasta). / the ML/Shopee/Amazon/Magalu adapters are simulated; wiring the real ones is the next step.
- `banco-de-questoes`: as 60 questões são fictícias (direitos de conteúdo real são de quem operar) e há avisos do npm audit descritos no README da pasta. / the 60 questions are fictional (rights to real content belong to the operator) and there are npm audit warnings described in the folder README.
- `pdv-restaurante`: a NFC-e é só uma prévia sem valor fiscal. / the NFC-e is only a preview with no fiscal value.

## Licença e atribuição / License and attribution

O conteúdo deste repositório (catálogo, scripts e `apps/`) é [MIT](LICENSE). Os projetos catalogados mantêm as licenças e as marcas de seus donos; fontes de inspiração e atribuições em [NOTICE.md](NOTICE.md). / This repository's own content is MIT. Cataloged projects keep their owners' licenses and trademarks.
