# Kanban de Equipe

**English:** a small, self-hosted team ops app: Kanban board, projects, team and a lightweight budget view, backed by Node.js/Express and MongoDB with a vanilla-JS frontend (no build step). It syncs GitHub Issues both ways and ships an MCP server so Claude (or any MCP client) can read and move cards, plus an OpenAPI schema for a ChatGPT Custom GPT Action. One workspace per installation; no open sign-up (only admins create users). MIT licensed.

---

App de operações para equipes pequenas: quadro Kanban, projetos, equipe e financeiro leve por projeto. Backend próprio (Node.js + Express + MongoDB), front em JavaScript puro sem etapa de build. Sem dependência de nuvem de terceiros.

## Recursos

- **Kanban** com cinco colunas (Backlog, A Fazer, Em Andamento, Revisão, Concluído), arrastar e soltar, prioridade, prazo, responsável, checklist e comentários.
- **Projetos** com orçamento, gasto e custo/hora, e uma tela de **Financeiro** com o percentual do orçamento consumido por projeto.
- **Equipe**: não existe cadastro aberto. O primeiro admin é criado por script; depois só admins convidam pessoas (com senha temporária) e marcam outros admins.
- **Login** com JWT (30 dias) e senhas com bcrypt.
- **Sincronização de Issues do GitHub nos dois sentidos**, para qualquer repositório que o token alcance: issues viram cartões (labels viram etiquetas, issue fechada vai para Concluído, reaberta volta para A Fazer, comentários vêm junto); mover o cartão para Concluído fecha a issue e comentários do cartão viram comentários na issue.
- **API key estática** (`x-api-key`) para agentes e automações, com acesso de admin. As ações aparecem como "Integração (MCP/GPT)".
- **Servidor MCP** (`mcp/`) para o Claude e **schema OpenAPI** (`/openapi.yaml`) para uma Action do ChatGPT.

## Servidor MCP: como conectar o Claude

O servidor MCP roda na máquina de quem usa (o Claude Desktop ou o Claude Code o iniciam por stdio). Ele não guarda dados: cada ferramenta chama a API REST da sua instalação com a API key.

Ferramentas expostas (10):

| Ferramenta | O que faz |
|---|---|
| `list_projects` | lista os projetos |
| `create_project` | cria um projeto (`hours` = orçamento em milhares de reais) |
| `list_tasks` | lista os cartões, com projeto, responsável, coluna e prioridade |
| `create_task` | cria um cartão (`backlog`, `todo`, `doing`, `review` ou `done`) |
| `update_task` | move de coluna, troca responsável, prioridade, título, descrição, prazo. Se o cartão estiver ligado a uma issue, `done` fecha a issue e sair de `done` reabre |
| `delete_task` | exclui o cartão |
| `list_users` | lista a equipe |
| `list_github_repos` | lista os repositórios sincronizados |
| `connect_github_repo` | conecta `owner/repo` e importa as issues |
| `sync_github` | força uma rodada de sincronização |

Configuração (Claude Desktop: Settings, Developer, Edit Config):

```bash
cd mcp && npm install
```

```json
{
  "mcpServers": {
    "kanban-de-equipe": {
      "command": "node",
      "args": ["/caminho/para/kanban-de-equipe/mcp/index.js"],
      "env": {
        "KANBAN_API_URL": "https://seu-dominio.exemplo",
        "KANBAN_API_KEY": "o mesmo valor de MCP_API_KEY do servidor"
      }
    }
  }
}
```

No Claude Code: `claude mcp add kanban-de-equipe -e KANBAN_API_URL=... -e KANBAN_API_KEY=... -- node /caminho/para/kanban-de-equipe/mcp/index.js`.

**ChatGPT:** não fala MCP. Crie um GPT, adicione uma Action, cole o conteúdo de `https://seu-dominio.exemplo/openapi.yaml` (troque o `servers.url` do arquivo pelo seu domínio) e use autenticação por API key com cabeçalho `x-api-key`.

A API key vale como admin: trate como senha e gere outra se desconfiar de vazamento.

## Como rodar

Precisa de Node 20+ e de um MongoDB acessível.

```bash
cd server
npm install
cp exemplo.env .env        # preencha JWT_SECRET (obrigatório) e, se quiser, MCP_API_KEY
# primeiro admin (uma vez); prefira variáveis de ambiente a argumentos, que aparecem no histórico do shell:
SEED_ADMIN_NAME="Seu Nome" SEED_ADMIN_EMAIL=voce@empresa.com SEED_ADMIN_PASSWORD='uma-senha-forte' node seed-admin.js
node index.js               # http://localhost:3000
```

O próprio servidor entrega o front (`index.html`, `app.js`, `styles.css`) e a API na mesma porta. Ele se recusa a subir sem `JWT_SECRET`. Em produção use `pm2` ou `systemd` e um proxy com HTTPS (Nginx ou Caddy) na frente.

**Docker** (app + MongoDB):

```bash
cp docker.exemplo.env .env   # preencha JWT_SECRET
docker compose up -d --build
docker compose exec -e SEED_ADMIN_NAME="Seu Nome" -e SEED_ADMIN_EMAIL=voce@empresa.com \
  -e SEED_ADMIN_PASSWORD='uma-senha-forte' app node server/seed-admin.js
```

O `docker-compose.yml` teve a sintaxe validada (`docker compose config`), mas a imagem **não foi construída nem executada** na preparação deste pacote.

## Variáveis de ambiente (`server/.env`)

| Variável | Padrão | Para quê |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | conexão com o MongoDB |
| `MONGODB_DB` | `kanban` | nome do banco |
| `JWT_SECRET` | (obrigatória) | segredo que assina os tokens de login |
| `PORT` | `3000` | porta HTTP |
| `MCP_API_KEY` | vazia (desligada) | chave estática para MCP e GPT |
| `GITHUB_TOKEN` | vazio (sync desligado) | token com escopo `repo` (classic) ou Issues read/write (fine-grained) |
| `GITHUB_SYNC_MINUTES` | `5` | intervalo da sincronização |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_ROLE` | | só para `seed-admin.js` (senha com no mínimo 8 caracteres) |

No MCP: `KANBAN_API_URL` e `KANBAN_API_KEY`.

Conectar um repositório (não há tela ainda; use a API, o MCP ou o GPT):

```bash
curl -X POST https://seu-dominio.exemplo/api/github/repos \
  -H "Content-Type: application/json" -H "x-api-key: $MCP_API_KEY" \
  -d '{"owner":"dono-do-repo","repo":"nome-do-repo"}'
```

## Testes

```bash
cd server
npm install
npm test
```

São 62 testes com `node:test`, rodando a API de verdade contra um MongoDB em memória (`mongodb-memory-server`, que baixa o binário do Mongo na primeira execução). Sem rede, aponte para um Mongo descartável com `MONGODB_URI_TESTE=mongodb://127.0.0.1:27017 npm test` (cada arquivo cria e apaga o próprio banco). A chamada ao GitHub é simulada: nenhum teste sai da máquina.

Cobertura: login e JWT (token forjado, expirado, usuário apagado), permissões de admin e da API key, CRUD de cartões e validação de coluna, regras do financeiro (orçamento padrão, gasto inválido, percentual sem divisão por zero) e a sincronização com o GitHub (paginação, incremental, abrir/fechar, comentários sem duplicar, falha do GitHub sem travar o cartão). **Não cobertos:** o front (`app.js`, sem teste automatizado) e o servidor MCP (só verificado à mão: lista as 10 ferramentas e chama a API).

## Estrutura

```
index.html, app.js, styles.css   front estático, sem build
server/
  index.js        sobe o servidor (valida JWT_SECRET, agenda o sync)
  app.js          rotas Express (createApp, usado também pelos testes)
  auth.js         JWT, admin, API key
  finance.js      regras de orçamento e gasto
  github.js       cliente da API do GitHub
  githubSync.js   sincronização issues <-> cartões
  seed-admin.js   cria o primeiro admin
  openapi.yaml    schema para o ChatGPT
  test/           testes
mcp/index.js      servidor MCP (stdio)
Dockerfile, docker-compose.yml
```

## Limites honestos

- **Não é multi-tenant.** Uma instalação é um workspace: todos os usuários veem todos os projetos e cartões. Para outra equipe, suba outra instância e outro banco.
- Todo usuário logado pode criar, editar e apagar projetos e cartões; só a gestão de usuários e do GitHub exige admin. Não há permissão por projeto.
- O financeiro é só orçamento, gasto (digitado) e custo/hora do projeto: sem lançamentos, faturas nem relatórios. O orçamento é informado em milhares de reais e a moeda é fixa em R$.
- A tela atualiza por polling a cada 8 s, sem websocket.
- O JWT dura 30 dias e é guardado no `localStorage`; não há logout remoto nem recuperação de senha (o admin recria o usuário).
- Sem limite de tentativas de login. Coloque um proxy com rate limit na frente se for expor à internet.
- A sincronização do GitHub é por polling, lê no máximo 1.000 issues por rodada (10 páginas de 100) e não resolve conflito de edição (vale a última escrita). Anexos de cartão não existem.
- O front carrega fontes e ícones de CDNs públicos (Google Fonts, unpkg).
- O pacote Docker não foi executado, e o servidor nunca foi testado em produção real (só localmente, com MongoDB 7).

## Licença

MIT (ver LICENSE na raiz).
