# Fábrica de SaaS

**Ten open-source SaaS products you can sell, self-host or redistribute (MIT).** Each one lives in
its own folder under `apps/`, runs on its own, comes with tests, and was cleaned of brand, client
data and private infrastructure. Nothing here needs a private service to start.

**Dez SaaS open source prontos para vender, usar na sua empresa ou distribuir.** Licença MIT: você
pode usar, modificar, revender e redistribuir, inclusive comercialmente. Cada pasta de `apps/` roda
sozinha, tem testes e instruções próprias.

| # | Produto | O que faz | Stack | Testes |
|---|---|---|---|---|
| 1 | [`gestao-juridica`](apps/gestao-juridica) | Escritório de advocacia: processos (CNJ validado), prazos pelo CPC, agenda, documentos com versões, alertas, login com papéis | Python, FastAPI, SQLite | 129 |
| 2 | [`links-de-pagamento`](apps/links-de-pagamento) | Links de pagamento no **seu** Stripe (valor fixo, livre, mensal; Pix, cartão, parcelado), checkout com sua marca, webhook assinado | Cloudflare Worker, KV | 62 |
| 3 | [`loja-minima`](apps/loja-minima) | Loja pequena: vitrine, carrinho, checkout, painel do dono, frete; preço sempre recalculado no servidor | Cloudflare Worker, KV | 43 |
| 4 | [`ponto-eletronico`](apps/ponto-eletronico) | Ponto com GPS e reconhecimento facial no celular, espelho do mês para o RH, auditoria, multiempresa | Cloudflare Worker, D1 | 24 |
| 5 | [`hub-de-marketplaces`](apps/hub-de-marketplaces) | Hub de e-commerce multicanal: catálogo, preço, estoque, anúncios, pedidos. **Adaptadores de canal simulados** | TanStack Start, Postgres, Better Auth | 42 |
| 6 | [`fitrich`](apps/fitrich) | Finanças pessoais e treino/nutrição, 100% no aparelho (PWA, sem backend), PT/EN | JS puro, IndexedDB | 592 |
| 7 | [`banco-de-questoes`](apps/banco-de-questoes) | Banco de questões para concursos, progresso por matéria, "chance de passar" | Next.js, Prisma, Postgres, Auth.js | 29 |
| 8 | [`kanban-de-equipe`](apps/kanban-de-equipe) | Kanban, projetos, equipe e financeiro leve, sincroniza Issues do GitHub, servidor MCP para agentes de IA | Node, Express, MongoDB | 62 |
| 9 | [`pdv-restaurante`](apps/pdv-restaurante) | PDV de restaurante: mesas, comandas, cozinha, caixa, divisão de conta | HTML/JS puro | 14 |
| 10 | [`migracao-de-legado`](apps/migracao-de-legado) | Kit para tirar sistema legado do lugar: lê Delphi ou Laravel, escreve o contrato de regras e gera o app novo | Python | 75 |

Total medido: **1.072 testes** passando no dia da publicação (comandos em cada README).

## Leia antes de colocar em produção

Isto é código real, testado, mas **nunca auditado por terceiros** e a maior parte **nunca rodou em produção
de outra pessoa**. Cada README diz o que não foi testado. Em especial:

- **Pagamentos** (`links-de-pagamento`, `loja-minima`): só foram exercitados em modo falso; use a chave de teste do Stripe primeiro.
- **Biometria** (`ponto-eletronico`): não é REP-P homologado, não gera AFD/AEJ, e dado biométrico exige consentimento e RIPD/DPIA (LGPD). Os pesos dos modelos faciais **não** estão no repositório: um script baixa do pacote oficial, e a licença de um deles (antispoof) não foi confirmada.
- **Jurídico** (`gestao-juridica`): a integração com DataJud nunca foi chamada na API real e não há assinatura ICP-Brasil.
- **Fiscal** (`pdv-restaurante`): a NFC-e é só uma prévia sem valor fiscal.
- **Marketplaces** (`hub-de-marketplaces`): os adaptadores ML/Shopee/Amazon/Magalu são simulados; integrar os reais é o próximo passo (`docs/adaptadores.md`).
- **Conteúdo** (`banco-de-questoes`): as 60 questões são fictícias; direitos autorais de conteúdo real são de quem operar. Há avisos do `npm audit`, descritos no README.
- Revise dependências, troque todos os segredos de exemplo e rode os testes no seu ambiente.

## Como usar

```bash
git clone https://github.com/thiagopatzdorf/fabrica-de-saas
cd fabrica-de-saas/apps/<produto>   # leia o README da pasta
```

Cada produto é independente: copie a pasta, renomeie, troque a marca e publique. Contribuições são bem-vindas
(issue ou PR); mantenha testes verdes e nenhum segredo no repositório.

## Licença

[MIT](LICENSE). Dependências de terceiros mantêm as próprias licenças (ver `THIRD_PARTY.md` onde existir).
