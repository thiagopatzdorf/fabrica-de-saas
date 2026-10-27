# Gestão Jurídica

**English summary.** Case-management system for Brazilian law firms: lawsuits with validated CNJ numbers, deadlines computed under the Brazilian Code of Civil Procedure (CPC), calendar, documents with versions/OCR/e-signature, alerts and an optional DataJud (CNJ) integration. Python 3.12 + FastAPI + SQLite, plain-JavaScript front end with no build step. Beta, MIT licensed. Deadline dates are decision support, not legal advice.

Sistema de gestão para escritórios de advocacia (pequenos e médios) e para quem quer um ponto de partida
aberto para vender, hospedar ou adaptar um produto jurídico. Processos com número CNJ validado, prazos com
contagem pelo CPC, agenda, documentos com versões, OCR opcional e assinatura eletrônica, alertas e consulta ao DataJud.

| | |
|---|---|
| **Stack** | Python 3.12+ · FastAPI · SQLite (sem ORM) · front em JavaScript puro (sem build) |
| **Estado** | beta (v0): sem CI e sem deploy definido; não foi usado em produção |

## Como rodar

```bash
cd apps/gestao-juridica
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt            # execução
pip install -r requirements-dev.txt        # testes e demo

export LEGAL_COOKIE_INSEGURO=1             # só para http local; em produção use HTTPS e não defina
export LEGAL_ADMIN_EMAIL=admin@exemplo.com
export LEGAL_ADMIN_SENHA='troque-esta-senha-longa'
python -m uvicorn juridico.app:criar --factory --port 8765
```

Abra http://127.0.0.1:8765 e entre com o e-mail e a senha acima (o administrador só é criado com o banco sem usuários).
Os dados ficam em `./data` (ou em `LEGAL_DATA_DIR`); essa pasta nunca vai para o Git.

**Dados fictícios de demonstração** (banco vazio, servidor no ar, mesmas variáveis `LEGAL_ADMIN_*` no ambiente):
`python -m juridico.demo`.

**Rotina diária** (cron): `python -m juridico.ciclo` marca prazos perdidos, gera e entrega alertas e atualiza andamentos pelo DataJud.

**Testes:** `python -m pytest -q tests`

Há um `exemplo.env` com todas as variáveis; o app lê o ambiente (não carrega `.env` sozinho): `set -a; . ./.env; set +a`.

## Estrutura

```
juridico/   backend FastAPI (api_*.py = rotas, cnj.py, regras_prazo.py, calendario.py, datajud.py, alertas.py, db.py, seguranca.py, demo.py, ciclo.py)
static/     front em JS puro (index.html, assinar.html, js/, styles.css)
tests/      testes pytest
```

## O que cobre

| módulo | o que faz |
|---|---|
| Processos | judicial, administrativo e extrajudicial; número CNJ validado pelo dígito verificador (tribunal e UF deduzidos); partes e advogados por polo; responsáveis; fases com histórico; andamentos manuais, importados ou do DataJud (sem duplicar); vínculos (apenso, recurso, execução…); busca por cliente, CPF/CNPJ, número, parte ou assunto, sem depender de acento ou pontuação; processo restrito |
| Prazos | contagem CPC (úteis/corridos, DJe, recesso 20/12–20/01, feriados nacionais e locais por tribunal, dobro) com memória de cálculo; responsável e revisor (quem cumpre manda para revisão, só o revisor conclui); status pendente/em andamento/em revisão/concluído/perdido/cancelado; perdido é marcado pelo sistema; histórico de quem criou, alterou ou concluiu; fatal interno |
| Publicações | importa intimações, acha o processo pelo número, sugere o prazo pela lei (considerando o rito, ex.: execução fiscal = 30 dias) e **espera a confirmação humana** |
| Agenda | audiência, reunião, sustentação oral, perícia, diligência, compromisso e vencimento financeiro, junto com os prazos; dia/semana/mês; filtros por advogado, cliente, processo e tipo |
| Documentos | cliente → processo → pastas (Petição Inicial, Documentos, Provas, Decisões, Recursos); upload com versões; busca dentro de PDF/DOCX/texto e de imagem/PDF escaneado quando há Tesseract; controle de acesso; exclusão reversível; assinatura eletrônica com selo verificável (por login ou link de uso único); modelos com variáveis que geram .docx |
| Alertas | caixa de saída idempotente por prazo/evento, nos canais app, e-mail (SMTP) e WhatsApp (webhook) |

## Limites declarados (o que NÃO é verdade ainda)

- **A data do prazo é apoio, não palavra final.** O calendário base só tem feriados nacionais; feriado
  estadual/municipal e suspensão de expediente entram em Configurações. O advogado confere.
- **Captura automática de publicações:** o sistema importa (texto colado ou JSON) e processa; **não há
  conexão pronta com DJe/DJEN/PJe**. O DJEN respondeu 403 à consulta sem credenciais de a partir do ambiente de desenvolvimento.
- **DataJud:** adaptador escrito e testado com resposta simulada; **não foi exercitado contra a API real**
  (precisa de `DATAJUD_API_KEY`, a chave pública que o CNJ publica). Ele traz andamentos, não publicações.
- **Assinatura:** eletrônica simples/avançada (Lei 14.063/2020), com selo HMAC. **Não é ICP-Brasil.**
- **OCR:** só com `tesseract` (e `pdftoppm` para PDF escaneado) instalados; sem eles o arquivo entra marcado
  como "sem OCR", visível na tela.
- **E-mail e WhatsApp:** sem `LEGAL_SMTP_HOST` / `LEGAL_WHATSAPP_WEBHOOK_URL` o alerta fica `sem_provedor`, nunca "enviado".
- **Modelos de documento** são texto-base para revisão do advogado.
- Sem exclusão definitiva de processo/cliente pela API (arquivar/inativar). Apagar dado pessoal (LGPD) é operação à parte.

## Configuração (variáveis de ambiente)

`LEGAL_DATA_DIR` (banco, arquivos, segredo; fora do Git) · `LEGAL_SECRET` (assina sessões e selos; sem ela nasce
uma em `LEGAL_DATA_DIR`) · `LEGAL_ADMIN_EMAIL`/`LEGAL_ADMIN_SENHA` (primeiro administrador, só com banco sem usuários) ·
`LEGAL_ESCRITORIO`, `LEGAL_CIDADE` (variáveis de modelo) · `LEGAL_LIMITE_UPLOAD_MB` (50) · `DATAJUD_API_KEY` ·
`LEGAL_SMTP_HOST|PORTA|USUARIO|SENHA|DE|STARTTLS` · `LEGAL_WHATSAPP_WEBHOOK_URL|TOKEN`.

## Segurança

Senhas em scrypt; sessão assinada em cookie `HttpOnly; SameSite=Strict; Secure`, trocar a senha derruba as sessões;
limite de tentativas de login; processo restrito responde 404 a quem não tem acesso (inclusive na busca de documentos);
upload com lista de extensões, limite de tamanho, nome no disco = hash, download sempre como anexo com `nosniff`;
CSP sem script inline; front monta o DOM por `textContent` (nunca `innerHTML` com dado); token de assinatura guardado só como hash.
Todo dado é de clientes: **o diretório de dados precisa de backup e disco cifrado** e a aplicação deve ficar atrás de HTTPS.

## Inversas

Documento excluído volta por `POST /api/documentos/{id}/restaurar`. Prazo cancelado/concluído o administrador reabre.
Nada daqui apaga processo ou cliente.

## Aviso legal e LGPD

Software fornecido "como está", sem garantia (ver LICENSE). Não substitui a conferência do advogado: prazos,
feriados locais e a validade de assinaturas são responsabilidade de quem usa. Os dados de clientes são dados
pessoais (LGPD): quem hospeda é o controlador, e precisa de base legal, backup, disco cifrado, HTTPS e rotina de
eliminação (o sistema não apaga dado pessoal pela API).

## Licença

MIT (ver LICENSE na raiz).
