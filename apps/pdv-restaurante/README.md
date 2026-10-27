# PDV Restaurante

*An open-source point-of-sale for restaurants that runs entirely in the browser: tables, tabs, counter and delivery orders, a kitchen screen, cash drawer, bill splitting and an NFC-e (Brazilian e-receipt) **preview**. Plain HTML/CSS/JS, no build step, no dependencies; all money math is done in integer cents in a pure module (`js/motor.mjs`). Data lives in `localStorage`. It is a demo-grade/starter POS, not a certified fiscal system.*

PDV de restaurante gratuito e open source, em HTML, CSS e JavaScript puros. Sem servidor, sem dependências, sem build.

## Recursos

- **Salão**: mesas, comandas, observação por item, taxa de serviço (10%), desconto em valor ou porcentagem.
- **Balcão e delivery**: pedidos avulsos com nome e endereço do cliente.
- **Cozinha**: tela com os pedidos na ordem de chegada (bebida de geladeira não vai para a cozinha).
- **Caixa**: abertura com fundo de troco, sangria, suprimento e fechamento com conferência do dinheiro contado.
- **Pagamento**: dinheiro, crédito, débito, Pix e vale, pagamento misto, troco e **divisão de conta** por N pessoas.
- **Cardápio editável** (com NCM e CFOP por item) e **relatórios do dia**.
- **Prévia de NFC-e** no cupom de 80 mm, com chave de 44 dígitos, tributos aproximados (Lei 12.741) e CPF/CNPJ na nota.
- Tema claro/escuro, funciona em tablet e celular, backup em JSON.

## Como rodar

Precisa só servir os arquivos estáticos. Com Node 18+:

```sh
npm run serve          # http://127.0.0.1:8080/
# ou: node serve.mjs 3000
# ou qualquer servidor estático: python3 -m http.server 8080
```

Abra `http://127.0.0.1:8080/pdv.html`. (Abrir o arquivo direto por `file://` não funciona: o navegador bloqueia módulos ES.)

## Usando o PDV: o fluxo de uma mesa

1. Aba **Caixa**: informe o fundo de troco e abra o caixa (sem caixa aberto o PDV recusa receber).
2. Aba **Salão**: toque na mesa 3; a comanda abre.
3. Toque nos itens do cardápio para lançar; ajuste quantidade, observação, taxa de serviço e desconto.
4. **Mandar para a cozinha**: os itens aparecem na aba **Cozinha**.
5. **Fechar conta**: escolha a forma, digite o valor e **Lançar**; repita para pagamento misto. Use "Dividir por" para ver a parte de cada pessoa.
6. Marque se quer a prévia da NFC-e (e CPF/CNPJ opcional) e **Finalizar venda**: o cupom aparece, pronto para imprimir.
7. No fim do dia: **Relatórios** e, em **Caixa**, o fechamento com o dinheiro contado.

## Testes

```sh
npm test
```

Roda `node --test tests/*.test.mjs`:

- `tests/motor.test.mjs`: o motor (centavos, taxa de serviço, desconto, divisão, troco, NFC-e, caixa). Cada nome de teste descreve o defeito que ele barra.
- `tests/e2e.test.mjs`: uma venda inteira no Chromium (abre caixa, mesa, itens, cozinha, pagamento misto com troco, cupom, fechamento, recarga da página) em 1440 e 390 px, sem erro de console/CSP/rede nem rolagem lateral. Precisa do Playwright (`npm i -D playwright && npx playwright install chromium`); sem ele, o teste é pulado. `PLAYWRIGHT=<pasta>` aponta um módulo instalado em outro lugar.

## Estrutura

```
index.html        página de apresentação
pdv.html          o PDV (CSP estrita, nada inline)
js/motor.mjs      regras puras: dinheiro em centavos, contas, caixa, NFC-e (sem DOM)
js/pdv.js         estado, desenho e eventos
js/tema.js        aplica o tema salvo antes da pintura
css/              estilos (fontes do sistema, sem recurso externo)
serve.mjs         servidor estático sem dependências
tests/            motor.test.mjs, e2e.test.mjs, e2e.mjs (roteiro do navegador)
```

## Limites honestos

- **Dados só no navegador** (`localStorage`): limpar os dados do site apaga tudo. Use "Baixar cópia (JSON)" nos Ajustes.
- **Sem multiusuário, sem login e sem sincronização** entre aparelhos; dois tablets não enxergam as mesmas mesas.
- **A NFC-e é só uma prévia, sem valor fiscal.** Nada é enviado à SEFAZ, não há certificado digital, CSC, protocolo de autorização nem QR Code válido, e a chave de acesso é fictícia. **Não substitui um sistema fiscal homologado.** NCM, CFOP e alíquotas do cardápio de exemplo são ilustrativos: quem define os do seu restaurante é o contador.
- Sem integração com iFood, TEF, maquininha ou impressora fiscal; a impressão usa o diálogo do navegador.
- O CNPJ, o nome e o endereço do restaurante de exemplo são fictícios (troque em Ajustes).

## Licença

Licença: MIT (ver LICENSE na raiz).
