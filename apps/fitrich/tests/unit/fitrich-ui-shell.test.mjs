// Shell do Fitrich v2 (Node, sem DOM): registro de telas, dicionários (paridade e vocabulário sem culpa),
// parser do texto livre, dados de exemplo (entram e somem sem se misturar) e os insumos da tela Hoje.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { adicionar, validar, vazio } from "../../app/js/v2/esquema.mjs";
import { paridade } from "../../app/js/v2/ui/i18n.mjs";
import { CONTA_PADRAO_ID, garantirConta } from "../../app/js/v2/ui/conta-padrao.mjs";
import { PREFIXO, dadosExemplo, ehExemplo, sairDoExemplo } from "../../app/js/v2/ui/dados-exemplo.mjs";
import { NOMES_ICONES } from "../../app/js/v2/ui/icones.mjs";
import { alertaHoje, insumosGastarHoje, proximosVencimentos } from "../../app/js/v2/ui/insumos-hoje.mjs";
import { analisar, lerValor } from "../../app/js/v2/ui/parser-lancamento.mjs";
import { ABAS_INFERIORES, TELAS, TELA_INICIAL, carregarTela, porId } from "../../app/js/v2/ui/telas/indice.mjs";
import dicApp from "../../app/js/v2/ui/app.i18n.mjs";
import dicHoje from "../../app/js/v2/ui/telas/hoje.i18n.mjs";
import dicLancar from "../../app/js/v2/ui/telas/lancar.i18n.mjs";

const T0 = "2026-10-05T12:00:00.000Z";
const agora = () => T0;
const HOJE = "2026-10-05";
const UI = new URL("../../app/js/v2/ui/", import.meta.url);

test("registro: as 11 telas de base mais as novas, com id único, ícone existente, grupo válido, Hoje inicial e 4 abas inferiores", () => {
  // Tela nova entra no registro sem mexer neste número: o que não pode é faltar uma das 11 de base nem repetir id.
  for (const id of ["hoje", "financas", "cartoes", "metas", "patrimonio", "dividas", "shape", "checkin", "importar", "dados", "regras"]) assert.ok(TELAS.some((t) => t.id === id), `falta a tela ${id}`);
  assert.equal(new Set(TELAS.map((t) => t.id)).size, TELAS.length);
  assert.ok(porId("aparelho"), "a tela App e aparelho está registrada");
  for (const t of TELAS) { assert.ok(NOMES_ICONES.includes(t.icone), `ícone ${t.icone}`); assert.ok(["principal", "mais"].includes(t.grupo)); assert.equal(typeof t.carregar, "function"); }
  assert.equal(TELA_INICIAL, "hoje");
  assert.deepEqual(ABAS_INFERIORES, ["hoje", "financas", "cartoes", "metas"]);
  assert.equal(porId("nao-existe"), null);
});

test("registro: tela ainda inexistente vira 'em breve' em vez de lançar; a Hoje carrega e bate o contrato", async () => {
  const r = await carregarTela({ id: "futura", carregar: async () => { throw new Error("ainda não existe"); } });
  assert.equal(r.ok, false); assert.equal(r.codigo, "tela.em_breve");
  for (const t of TELAS) { const c = await carregarTela(t); assert.equal(c.ok, true, `tela ${t.id} carrega e bate o contrato`); }
  const h = await carregarTela(porId("hoje"));
  assert.equal(h.ok, true); assert.equal(h.tela.id, "hoje"); assert.equal(typeof h.tela.montar, "function");
  assert.equal(h.tela.i18n, "/js/v2/ui/telas/hoje.i18n.mjs"); assert.deepEqual(h.tela.css, ["/css/hoje.css", "/css/insights.css"]);
  const invalido = await carregarTela({ id: "x", carregar: async () => ({ tela: { id: "y" } }) });
  assert.equal(invalido.codigo, "tela.invalida");
});

test("dicionários: pt-BR e en com as mesmas chaves e placeholders, toda tela registrada tem título no shell", () => {
  for (const [nome, d] of Object.entries({ app: dicApp, hoje: dicHoje, lancar: dicLancar })) assert.deepEqual(paridade(d), [], nome);
  for (const t of TELAS) assert.ok(dicApp["pt-BR"][`tela.${t.id}`], `tela.${t.id}`);
  const chaves = Object.keys(dicHoje["pt-BR"]);
  assert.ok(chaves.every((k) => k.startsWith("hoje.")), "prefixo da tela");
  assert.ok(Object.keys(dicLancar["pt-BR"]).every((k) => k.startsWith("lancar.")));
});

test("vocabulário sem culpa e sem sequência: nenhum dicionário nem tela usa as palavras proibidas do contrato", () => {
  const proibidas = /estour|falhou|falhar|perdeu a sequ|sequência|seguidas|streak|atrasad|culpa/i;
  for (const d of [dicApp, dicHoje, dicLancar]) for (const l of ["pt-BR", "en"]) for (const [k, v] of Object.entries(d[l])) assert.doesNotMatch(v, proibidas, `${l}:${k}`);
  for (const f of ["telas/hoje.mjs", "telas/lancar.mjs", "insumos-hoje.mjs"]) assert.doesNotMatch(readFileSync(new URL(f, UI), "utf8"), /estourou|streak|sequenciaSemanas/, f);
});

test("telas e shell: texto só por t() (nenhuma string literal com letra em filho de h()), sem innerHTML, sem rede, sem style", () => {
  const arquivos = ["telas/hoje.mjs", "telas/lancar.mjs", "../../app.mjs"];
  for (const f of arquivos) {
    const s = readFileSync(new URL(f, UI), "utf8");
    for (const p of ["innerHTML", "fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "style:", "vars:", "setAttribute(\"style\""]) assert.ok(!s.includes(p), `${f} contém ${p}`);
    // Filho literal de h(): h("tag", {...}, "Texto com letras") é string de interface fora do t().
    const literais = [...s.matchAll(/h\("[a-z0-9]+",\s*(?:null|\{[^}]*\}),\s*"([^"]*[A-Za-zÀ-ú]{3,}[^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(literais, [], `${f}: texto literal`);
  }
});

test("parser: valor com vírgula/ponto/R$/milhar, 'ontem'/'hoje', categoria por nome (nos dois idiomas) e por regra", () => {
  const cats = [{ id: "cat-mercado", tipo: "despesa", nomes: ["Mercado", "Groceries"] }, { id: "cat-saude-fitness", tipo: "despesa", nomes: ["Saúde e fitness", "Health & fitness"] }, { id: "cat-salario", tipo: "receita", nomes: ["Salário", "Salary"] }];
  const o = { categorias: cats, hoje: HOJE };
  assert.deepEqual(analisar("almoço 32 mercado", o), { centavos: 3200, categoriaId: "cat-mercado", descricao: "almoço", data: HOJE, tipo: "despesa" });
  assert.deepEqual(analisar("R$ 1.234,56 saude e fitness ontem", o), { centavos: 123456, categoriaId: "cat-saude-fitness", descricao: "", data: "2026-10-04", tipo: "despesa" });
  assert.equal(analisar("R$32,50 café", o).centavos, 3250);
  assert.equal(analisar("12,5 padaria hoje", o).centavos, 1250);
  assert.deepEqual(analisar("+5000 salário", o), { centavos: 500000, categoriaId: "cat-salario", descricao: "", data: HOJE, tipo: "receita" });
  assert.equal(analisar("recebi 300 freela", o).tipo, "receita");
  assert.deepEqual(analisar("lunch 32.50 groceries yesterday", { ...o, idioma: "en" }), { centavos: 3250, categoriaId: "cat-mercado", descricao: "lunch", data: "2026-10-04", tipo: "despesa" });
  assert.equal(analisar("1,234.56 groceries", { ...o, idioma: "en" }).centavos, 123456);
  assert.equal(analisar("uber 12/09", o).data, "2026-09-12");
  assert.equal(analisar("uber 9/12", { ...o, idioma: "en" }).data, "2026-09-12");
  const regra = analisar("ifood 45,9", { ...o, categorizar: (d) => (d.includes("ifood") ? "cat-delivery" : null) });
  assert.equal(regra.categoriaId, "cat-delivery"); assert.equal(regra.descricao, "ifood");
  assert.deepEqual(analisar("só texto", o), { centavos: null, categoriaId: null, descricao: "só texto", data: HOJE, tipo: "despesa" });
  assert.equal(analisar("", o).centavos, null);
  // "99" é empresa, não valor, quando vem depois de um valor já lido.
  assert.deepEqual([analisar("32 99 pop", o).centavos, analisar("32 99 pop", o).descricao], [3200, "99 pop"]);
});

test("lerValor: convenção por idioma; dois separadores = o último é o decimal; lixo e zero dão null", () => {
  assert.equal(lerValor("1.234", "pt-BR"), 123400); assert.equal(lerValor("1.234", "en"), null);
  assert.equal(lerValor("1,234", "en"), 123400); assert.equal(lerValor("1,234", "pt-BR"), null);
  assert.equal(lerValor("1.234,56", "pt-BR"), 123456); assert.equal(lerValor("1,234.56", "en"), 123456);
  assert.equal(lerValor("12,5", "pt-BR"), 1250); assert.equal(lerValor("12.5", "en"), 1250);
  assert.equal(lerValor("R$ 7", "pt-BR"), 700); assert.equal(lerValor("$7", "en"), 700);
  assert.equal(lerValor("0", "pt-BR"), null); assert.equal(lerValor("abc"), null); assert.equal(lerValor("1.2.3"), null); assert.equal(lerValor("1,2,3"), null);
});

test("conta padrão: criada uma vez com id fixo quando não há conta ativa; sugerida é a mais usada", () => {
  let d = vazio({ agora });
  d = garantirConta(d, { nome: "Carteira", hoje: HOJE, agora });
  assert.deepEqual(d.contas.map((c) => c.id), [CONTA_PADRAO_ID]);
  assert.equal(garantirConta(d, { nome: "Outra", hoje: HOJE, agora }), d, "já tem conta: não cria outra");
});

test("dados de exemplo: válidos em qualquer dia do mês, marcados, e `sairDoExemplo` deixa só o real", () => {
  for (const hoje of ["2026-10-01", "2026-10-05", "2026-10-31", "2026-02-28", "2027-01-15"]) {
    const d = dadosExemplo({ hoje, agora });
    assert.equal(validar(d).ok, true, hoje);
    assert.equal(ehExemplo(d), true);
    assert.ok(d.lancamentos.length > 30 && d.pesos.length > 20 && d.treinos.length > 10, hoje);
    assert.ok(d.lancamentos.every((l) => l.id.startsWith(PREFIXO)), "todo lançamento de exemplo tem o prefixo");
  }
  const d = dadosExemplo({ hoje: HOJE, agora, idioma: "en" });
  assert.equal(d.contas[0].nome, "Wallet");
  // Primeiro lançamento real na carteira: exemplo some inteiro, orçamento e metas zeram, conta padrão fica com saldo 0.
  const real = adicionar(d, "lancamentos", { data: HOJE, tipo: "despesa", centavos: 1500, categoriaId: "cat-transporte", contaId: CONTA_PADRAO_ID, moeda: "BRL" }, { agora, novoId: () => "real-1" });
  const s = sairDoExemplo(real);
  assert.equal(validar(s).ok, true);
  assert.equal(ehExemplo(s), false);
  assert.deepEqual(s.lancamentos.map((l) => l.id), ["real-1"]);
  assert.deepEqual([s.pesos.length, s.treinos.length, s.metas.length, s.recorrencias.length, s.cartoes.length, Object.keys(s.orcamento.limites).length], [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.contas.map((c) => [c.id, c.saldoInicialCentavos]), [[CONTA_PADRAO_ID, 0]]);
  assert.equal(s.perfil.idioma, "en"); assert.equal(s.perfil.alturaCm, null);
  // Primeiro lançamento real no CARTÃO de exemplo: o cartão fica (agora é da pessoa), o resto some.
  const cartao = d.cartoes[0].id;
  const noCartao = adicionar(d, "lancamentos", { data: HOJE, tipo: "despesa", centavos: 9900, categoriaId: "cat-lazer", cartaoId: cartao, meio: "credito", moeda: "BRL" }, { agora, novoId: () => "real-2" });
  const s2 = sairDoExemplo(noCartao);
  assert.equal(validar(s2).ok, true);
  assert.deepEqual(s2.cartoes.map((c) => c.id), [cartao]);
  assert.deepEqual(s2.lancamentos.map((l) => l.id), ["real-2"]);
  assert.equal(sairDoExemplo(s2), s2, "sem exemplo, devolve o mesmo objeto");
});

test("insumos da Hoje: receita não conta duas vezes a recorrência já lançada; cartão só cobra compra de mês anterior; 1 alerta por prioridade", () => {
  const d = dadosExemplo({ hoje: HOJE, agora });
  const g = insumosGastarHoje(d, HOJE);
  assert.equal(g.insumos.receitaPrevistaMes, 480000, "salário do dia 5 já lançado + recorrência do dia 5 = uma vez só");
  assert.equal(g.insumos.fixasRestantes, 150000 + 9990, "aluguel (10) e internet (20) ainda vencem; academia é no cartão (fatura vence em nov)");
  assert.equal(g.insumos.parcelasCartaoMes, 0, "fatura que vence neste mês já não tem resto de compras antigas");
  assert.equal(g.insumos.aportesMetas, 90000, "viagem 6.000 − 1.500 em 5 meses");
  assert.equal(g.diasRestantes, 27); assert.equal(g.pctTempo, 16); assert.equal(g.codigo, "ok");
  assert.equal(g.porDiaCentavos, Math.floor(g.disponivelMesCentavos / 27));
  assert.equal(alertaHoje(d, HOJE), null);
  assert.deepEqual(proximosVencimentos(d, HOJE).map((v) => [v.nome, v.data]), [["Aluguel", "2026-10-10"], ["Academia", "2026-10-15"]]);
  // Limite passado vence o fluxo; fatura fechada com saldo vence o limite.
  const comLimite = { ...d, orcamento: { ...d.orcamento, limites: { "cat-mercado": 100 } } };
  assert.equal(alertaHoje(comLimite, HOJE)?.tipo, "limite");
  const fim = "2026-10-31";
  const a = alertaHoje(dadosExemplo({ hoje: fim, agora }), fim);
  assert.equal(a?.tipo, "fatura"); assert.equal(a.vencimento, "2026-11-05"); assert.equal(a.dias, 5);
  // Sem receita: código sem_receita (a tela ensina o próximo passo, não acusa).
  assert.equal(insumosGastarHoje(vazio({ agora }), HOJE).codigo, "sem_receita");
});

test("nada em js/v2/ui fala com a rede, usa innerHTML ou monta style inline", () => {
  const pasta = new URL("../../app/js/v2/ui/", import.meta.url);
  const varrer = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? varrer(new URL(e.name + "/", dir)) : [new URL(e.name, dir)]));
  const arquivos = varrer(pasta).filter((u) => u.pathname.endsWith(".mjs"));
  assert.ok(arquivos.length >= 12);
  for (const u of arquivos) {
    const s = readFileSync(u, "utf8");
    for (const p of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "innerHTML", "import(\"http", "with: { type"]) assert.ok(!s.includes(p), `${u.pathname} contém ${p}`);
  }
});
