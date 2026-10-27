# Política de licenças

O catálogo lista **software open source**. A licença vem do GitHub (campo SPDX) na hora da verificação e
é conferida toda semana. Fonte única da lista: `LICENCAS_ACEITAS` em `scripts/catalogo.py` (um teste
falha se este documento e o código divergirem).

## Aceitas

| SPDX | Família |
|---|---|
| MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, Zlib | permissivas |
| MPL-2.0, EPL-2.0, EUPL-1.2 | copyleft fraco / por arquivo |
| LGPL-2.1, LGPL-2.1-only, LGPL-2.1-or-later, LGPL-3.0, LGPL-3.0-only, LGPL-3.0-or-later | copyleft de biblioteca |
| GPL-2.0, GPL-2.0-only, GPL-2.0-or-later, GPL-3.0, GPL-3.0-only, GPL-3.0-or-later | copyleft |
| AGPL-3.0, AGPL-3.0-only, AGPL-3.0-or-later | copyleft de rede |

## Recusadas, e por quê

| Licença | Por que fica de fora |
|---|---|
| BUSL-1.1 (Business Source License) | source-available: proíbe uso em produção concorrente e só converte para open source depois de anos |
| SSPL-1.0 | não é aprovada pela OSI; obriga abrir toda a infraestrutura de quem oferece o software como serviço |
| Elastic-2.0 | proíbe oferecer como serviço gerenciado e burlar chaves de licença |
| Commons Clause | proíbe vender o software, o que contradiz a definição de open source |
| "fair-code", licença própria, "Other" | restringem uso ou revenda, ou não dizem o que permitem |
| NOASSERTION, vazio | o GitHub não identificou a licença: sem licença clara não há direito de uso |
| Qualquer SPDX fora da tabela acima | só entra depois de uma issue e de uma decisão registrada aqui |

## Open core

Projeto cuja parte relevante é proprietária (diretório `ee/`, módulos pagos) **entra**, com
`open_core: true`: a licença do núcleo é aberta, e a marca "open core" avisa que nem tudo é.

## Copyleft entra porque o catálogo só linka

GPL e AGPL entram: este repositório **nunca copia código de terceiros**, só aponta para eles (e escreve
descrições próprias). A obrigação do copyleft vale para quem usa e distribui o projeto, não para uma
lista de links. Se você adotar um item, leia a licença dele no repositório de origem.

## Inatividade

Último push há mais de 18 meses: o projeto fica **rebaixado** (aparece marcado como parado). Repositório
arquivado pelo dono: **excluído**.

---

# License policy

The catalog lists **open source software**. The license is the SPDX id GitHub reports at check time,
re-checked weekly. The single source of the list is `LICENCAS_ACEITAS` in `scripts/catalogo.py`.

**Accepted:** MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense, CC0-1.0, Zlib, MPL-2.0,
EPL-2.0, EUPL-1.2, LGPL-2.1/3.0 (and `-only`/`-or-later`), GPL-2.0/3.0 (and `-only`/`-or-later`),
AGPL-3.0 (and `-only`/`-or-later`).

**Rejected:** BUSL-1.1, SSPL-1.0, Elastic-2.0, Commons Clause, fair-code and custom licenses are
source-available, not open source. NOASSERTION, "Other" or empty means GitHub could not identify a
license, and without a clear license there is no right to use the code.

**Open core** is listed with `open_core: true`. **Copyleft** is listed because the catalog only links to
projects and never copies third-party code. **Stale** (no push in 18 months) is listed with a flag;
**archived** is excluded.
