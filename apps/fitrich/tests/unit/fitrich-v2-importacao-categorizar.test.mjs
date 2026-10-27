// Categorização por regras e aprendizado transparente do Fitrich v2.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizarDescricao, categorizar, validarRegex, regrasDaBase, criarRegra, editarRegra, removerRegra, registrarAcerto } from "../../app/js/v2/categorizar/regras.mjs";
import { aprender, tokenDominante, confirmarSugestao } from "../../app/js/v2/categorizar/aprender.mjs";

const JSON_BASE = JSON.parse(readFileSync(fileURLToPath(new URL("../../app/js/v2/categorizar/categorias-br.json", import.meta.url)), "utf-8"));
const base = regrasDaBase(JSON_BASE);
const nome = (descricao, regras = base) => categorizar(descricao, regras)?.categoriaNome ?? null;
let n = 0;
const novoId = () => `r${++n}`;

test("normalizar descrição tira prefixo de adquirente, parcela, números soltos e acento, mas mantém '99'", () => {
  assert.equal(normalizarDescricao("PG *IFOOD 2/3 12345"), "ifood");
  assert.equal(normalizarDescricao("PAG*JoseSilva"), "josesilva");
  assert.equal(normalizarDescricao("MP *MERCADOLIVRE 01/12"), "mercadolivre");
  assert.equal(normalizarDescricao("99* Viagem 02/07"), "99 viagem");
  assert.equal(normalizarDescricao("Compra com Cartão – PÃO DE AÇÚCAR 1234"), "compra com cartao pao de acucar");
  assert.equal(normalizarDescricao("Netflix.Com"), "netflix com");
  assert.equal(normalizarDescricao(""), "");
});

test("a base tem ≥150 padrões reais e cada categoria pedida casa o estabelecimento esperado", () => {
  assert.ok(base.length >= 150, `só ${base.length} padrões`);
  assert.ok(base.every((r) => r.origem === "base" && r.tipo === "contem"));
  assert.equal(nome("IFD*IFOOD RESTAURANTE 2/3"), "Restaurante e delivery");
  assert.equal(nome("RAPPI BRASIL"), "Restaurante e delivery");
  assert.equal(nome("UBER EATS"), "Restaurante e delivery"); // "uber eats" é mais longo que "uber"
  assert.equal(nome("UBER *TRIP"), "Transporte");
  assert.equal(nome("99* Viagem"), "Transporte");
  assert.equal(nome("POSTO SHELL AVENIDA"), "Transporte");
  assert.equal(nome("SMART FIT MENSALIDADE 01/12"), "Saúde e fitness");
  assert.equal(nome("BLUEFIT ACADEMIA"), "Saúde e fitness");
  assert.equal(nome("Netflix.Com"), "Assinaturas");
  assert.equal(nome("SPOTIFY AB"), "Assinaturas");
  assert.equal(nome("PRIME VIDEO"), "Assinaturas");
  assert.equal(nome("DROGASIL 1234"), "Saúde");
  assert.equal(nome("DROGA RAIA"), "Saúde");
  assert.equal(nome("PAGUE MENOS"), "Saúde");
  assert.equal(nome("PAO DE ACUCAR LOJA 123"), "Mercado");
  assert.equal(nome("CARREFOUR HIPER"), "Mercado");
  assert.equal(nome("ASSAI ATACADISTA"), "Mercado");
  assert.equal(nome("Pagamento Convênio – ENEL SÃO PAULO"), "Moradia");
  assert.equal(nome("SABESP"), "Moradia");
  assert.equal(nome("COMGAS"), "Moradia");
  assert.equal(nome("VIVO FIBRA"), "Telefone e internet");
  assert.equal(nome("CLARO S.A."), "Telefone e internet");
  assert.equal(nome("TIM CELULAR"), "Telefone e internet");
  assert.equal(nome("Tarifa Pacote de Serviços"), "Tarifas e juros");
  assert.equal(nome("TED recebida Salário Empresa Ltda"), "Salário");
  assert.equal(nome("EXTRAFARMA"), "Saúde"); // prefixo "extra" (Mercado) perde para o padrão mais longo
  assert.equal(nome("INTIMUS LOJA"), null); // "tim" só casa em início de palavra
  assert.equal(nome("Loja do Zé"), null);
});

test("usuário > aprendida > base, e dentro da origem maior prioridade vence", () => {
  const regras = [
    { id: "b", padrao: "uber", tipo: "contem", categoriaNome: "Transporte", prioridade: 9, origem: "base", acertos: 100 },
    { id: "a", padrao: "uber", tipo: "contem", categoriaNome: "Trabalho", prioridade: 0, origem: "aprendida", acertos: 0 },
    { id: "u", padrao: "uber", tipo: "contem", categoriaNome: "Viagem", prioridade: -5, origem: "usuario", acertos: 0 },
  ];
  assert.equal(categorizar("UBER *TRIP", regras).regraId, "u");
  assert.equal(categorizar("UBER *TRIP", regras.slice(0, 2)).regraId, "a");
  const duasDoUsuario = [...regras, { id: "u2", padrao: "uber", tipo: "contem", categoriaNome: "Outra", prioridade: 1, origem: "usuario", acertos: 0 }];
  assert.equal(categorizar("UBER", duasDoUsuario).regraId, "u2");
  assert.deepEqual(categorizar("UBER", duasDoUsuario).alternativas, ["u", "a", "b"]);
  assert.equal(categorizar("UBER", regras.map((r) => ({ ...r, ativa: false }))), null);
});

test("regex hostil é recusada e não trava: (a+)+$ contra 'aaaa…!' termina em menos de 1 s", () => {
  for (const p of ["(a+)+$", "(a*)*b", "(a|aa)+$", "(.*a){20}", "(x+x+)+y", "^(([a-z])+.)+[A-Z]([a-z])+$", "(a)\\1", "(?<=a)b", "a".repeat(200), "("]) {
    assert.equal(validarRegex(p).ok, false, p);
  }
  for (const p of ["uber|99", "^pix ", "ifood.*restaurante", "posto (shell|ipiranga)", "\\bnetflix\\b"]) assert.equal(validarRegex(p).ok, true, p);
  const hostil = [{ id: "h", padrao: "(a+)+$", tipo: "regex", categoriaNome: "X", prioridade: 0, origem: "usuario", acertos: 0 }];
  const t0 = Date.now();
  assert.equal(categorizar("a".repeat(5000) + "!", hostil), null);
  assert.ok(Date.now() - t0 < 1000, "regex hostil demorou");
  assert.throws(() => criarRegra([], { padrao: "(a+)+$", tipo: "regex" }, { novoId }), /regex recusada/);
  const ok = criarRegra([], { padrao: "posto (shell|ipiranga)", tipo: "regex", categoriaNome: "Transporte" }, { novoId });
  assert.equal(categorizar("POSTO IPIRANGA 123", ok).categoriaNome, "Transporte");
  assert.throws(() => editarRegra(ok, ok[0].id, { padrao: "(a*)*" }), /regex recusada/);
});

test("descrição com <img onerror> passa pela categorização como texto: não casa nada, não lança, não é alterada", () => {
  const d = "<img src=x onerror=alert(1)> Netflix.com";
  const r = categorizar(d, base);
  assert.equal(r.categoriaNome, "Assinaturas"); // a parte legível ainda categoriza
  assert.equal(d, "<img src=x onerror=alert(1)> Netflix.com");
  assert.equal(normalizarDescricao(d), "img src x onerror alert 1 netflix com");
});

test("ids de categoria são resolvidos pelo nome contra as categorias do núcleo; nome sem categoria fica null", () => {
  const regras = regrasDaBase(JSON_BASE, [{ id: "cat-1", nome: "Mercado" }, { id: "cat-2", nome: "Saúde e Fitness" }]);
  assert.equal(categorizar("CARREFOUR", regras).categoriaId, "cat-1");
  assert.equal(categorizar("SMART FIT", regras).categoriaId, "cat-2"); // caixa diferente no nome
  assert.equal(categorizar("NETFLIX", regras).categoriaId, null);
  assert.equal(categorizar("NETFLIX", regras).categoriaNome, "Assinaturas");
});

test("aprender: corrigir categoria cria regra 'aprendida' com o token dominante; corrigir de novo troca a categoria; aceitar soma acerto", () => {
  assert.equal(tokenDominante("PG *PADARIA DO JOAO LTDA 1234"), "padaria");
  assert.equal(tokenDominante("Pix enviado José da Silva"), "silva");
  assert.equal(tokenDominante("99* Viagem"), "viagem");
  assert.equal(tokenDominante("PIX TED DOC"), "pix ted doc"); // só palavras vazias: usa a descrição inteira
  assert.equal(tokenDominante(""), null);
  let regras = base;
  const r1 = aprender(regras, { descricao: "PG *PADARIA DO JOAO LTDA 1234", categoriaId: "cat-mercado", categoriaNome: "Mercado" }, { novoId });
  regras = r1.regras;
  assert.equal(r1.padrao, "padaria");
  assert.equal(r1.regra.origem, "aprendida");
  assert.equal(regras.length, base.length + 1);
  assert.equal(categorizar("PADARIA DO JOAO", regras).categoriaId, "cat-mercado"); // aprendida vence a base ("padaria" → Restaurante)
  const r2 = aprender(regras, { descricao: "PADARIA DO JOAO 999", categoriaId: "cat-mercado", categoriaNome: "Mercado" }, { novoId });
  assert.equal(r2.regras.length, regras.length); // mesma correção não duplica
  assert.equal(r2.regras.find((r) => r.id === r1.regra.id).acertos, 1);
  const r3 = aprender(r2.regras, { descricao: "PADARIA DO JOAO", categoriaId: "cat-lanche", categoriaNome: "Restaurante e delivery" }, { novoId });
  const regra = r3.regras.find((r) => r.id === r1.regra.id);
  assert.equal(regra.categoriaId, "cat-lanche");
  assert.equal(regra.acertos, 0);
  assert.equal(confirmarSugestao(r3.regras, regra.id).find((r) => r.id === regra.id).acertos, 1);
  assert.equal(registrarAcerto(r3.regras, "inexistente").length, r3.regras.length);
  const semEla = removerRegra(r3.regras, regra.id);
  assert.equal(categorizar("PADARIA DO JOAO", semEla).categoriaNome, "Restaurante e delivery");
  assert.equal(base.length, semEla.length); // a base original nunca foi mexida
});

test("nenhum módulo de categorização usa rede nem DOM", () => {
  for (const nomeArq of ["regras", "aprender"]) {
    const codigo = readFileSync(fileURLToPath(new URL(`../../app/js/v2/categorizar/${nomeArq}.mjs`, import.meta.url)), "utf-8");
    for (const proibido of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "document.", "window."]) assert.ok(!codigo.includes(proibido), `${nomeArq}.mjs usa ${proibido}`);
  }
});
