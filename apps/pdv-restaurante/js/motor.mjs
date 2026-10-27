// Motor do PDV de restaurante (pdv.html): só funções puras, sem DOM.
// Todo dinheiro é inteiro em centavos: 0,1 + 0,2 em float já fechou caixa errado em
// muito PDV. A tela (pdv.js) só chama daqui; o teste (tests/restaurantes) cobre daqui.

export const FORMAS = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  credito: "Cartão de crédito",
  debito: "Cartão de débito",
  vr: "Vale-refeição",
};
// Código tPag da NFC-e (leiaute 4.00) de cada forma: a prévia da nota mostra o mesmo
// que a nota autorizada vai mostrar.
export const TPAG = { dinheiro: "01", credito: "03", debito: "04", vr: "11", pix: "17" };

export function brl(centavos) {
  const neg = centavos < 0;
  const v = Math.abs(Math.round(centavos));
  const reais = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${reais},${String(v % 100).padStart(2, "0")}`;
}

// "12,50", "12.50", "1.234,5", "R$ 7" -> centavos. Texto que não é valor -> null
// (null e não 0: um campo em branco não pode virar pagamento de zero sem ninguém ver).
export function lerValor(texto) {
  let s = String(texto ?? "").replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function subtotal(itens) {
  return itens.reduce((t, i) => t + i.preco * i.qtd, 0);
}

// Taxa de serviço só incide sobre o consumo (nunca sobre a entrega), e o desconto vem
// antes dela: 10% de um prato com desconto é 10% do que o cliente pagou pelo prato.
export function totais(comanda, cfg = {}) {
  const sub = subtotal(comanda.itens || []);
  let desconto = 0;
  const d = comanda.desconto;
  if (d && d.v > 0) desconto = d.tipo === "pct" ? Math.round((sub * Math.min(d.v, 100)) / 100) : Math.min(d.v, sub);
  const base = sub - desconto;
  const pct = comanda.servico ? (cfg.servicoPct ?? 10) : 0;
  const servico = Math.round((base * pct) / 100);
  const entrega = comanda.tipo === "delivery" ? Math.max(0, comanda.entrega || 0) : 0;
  return { subtotal: sub, desconto, servico, entrega, total: base + servico + entrega };
}

// Pagamentos misturados: só dinheiro gera troco. Cartão, Pix e VR acima do que falta
// é erro de digitação (ninguém dá troco de Pix), então a função recusa em vez de aceitar.
export function conferirPagamentos(total, pagamentos) {
  const naoDinheiro = pagamentos.filter((p) => p.forma !== "dinheiro").reduce((t, p) => t + p.valor, 0);
  const dinheiro = pagamentos.filter((p) => p.forma === "dinheiro").reduce((t, p) => t + p.valor, 0);
  if (pagamentos.some((p) => !Number.isInteger(p.valor) || p.valor <= 0 || !FORMAS[p.forma])) {
    return { ok: false, erro: "Pagamento com valor ou forma inválida." };
  }
  if (naoDinheiro > total) return { ok: false, erro: "Cartão, Pix ou vale passam do total: não existe troco nessas formas." };
  const pago = naoDinheiro + dinheiro;
  const falta = Math.max(0, total - pago);
  const troco = Math.max(0, pago - total);
  return { ok: true, pago, falta, troco, quitado: falta === 0 };
}

// Divide em n partes que SOMAM o total: os centavos que sobram vão para as primeiras.
export function dividir(total, n) {
  n = Math.max(1, Math.floor(n));
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

const digitos = (s) => String(s ?? "").replace(/\D/g, "");

export function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const dv = ((s * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

export function cnpjValido(cnpj) {
  const d = digitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda).
export function dvChave(chave43) {
  let peso = 2, soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

export const UF_IBGE = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25,
  PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };

// Chave de acesso de 44 dígitos no formato da NFC-e (modelo 65). Na demonstração ela é
// montada aqui para a prévia ter a forma certa; a nota de verdade recebe a chave da SEFAZ.
export function chaveAcesso({ uf, data, cnpj, serie, numero, codigo, tpEmis = 1 }) {
  const cUF = UF_IBGE[uf];
  if (!cUF) throw new Error(`UF desconhecida: ${uf}`);
  const aamm = `${String(data.getFullYear()).slice(2)}${String(data.getMonth() + 1).padStart(2, "0")}`;
  const c43 = `${cUF}${aamm}${digitos(cnpj).padStart(14, "0")}65${String(serie).padStart(3, "0")}`
    + `${String(numero).padStart(9, "0")}${tpEmis}${String(codigo).padStart(8, "0")}`;
  if (c43.length !== 43) throw new Error("chave com tamanho errado");
  return c43 + dvChave(c43);
}

export const chaveEmBlocos = (chave) => chave.replace(/(\d{4})(?=\d)/g, "$1 ");

// Lei 12.741/2012: a nota mostra o valor aproximado dos tributos. O percentual vem da
// tabela IBPT de cada NCM; aqui é um por item (configurável), e a tela diz que é aproximado.
export function tributosAproximados(itens, pctPadrao) {
  return Math.round(itens.reduce((t, i) => t + (i.preco * i.qtd * (i.tributosPct ?? pctPadrao ?? 0)) / 100, 0));
}

// Caixa: o dinheiro que deve estar na gaveta é fundo + suprimentos − sangrias + o que
// entrou em dinheiro − o troco dado. Fechar comparando com o contado mostra a diferença.
export function resumoCaixa(caixa, vendas) {
  const movs = caixa.movs || [];
  const suprimentos = movs.filter((m) => m.tipo === "suprimento").reduce((t, m) => t + m.valor, 0);
  const sangrias = movs.filter((m) => m.tipo === "sangria").reduce((t, m) => t + m.valor, 0);
  const porForma = Object.fromEntries(Object.keys(FORMAS).map((f) => [f, 0]));
  let troco = 0;
  for (const v of vendas) {
    for (const p of v.pagamentos) porForma[p.forma] += p.valor;
    troco += v.troco || 0;
  }
  const esperadoDinheiro = (caixa.fundo || 0) + suprimentos - sangrias + porForma.dinheiro - troco;
  return { fundo: caixa.fundo || 0, suprimentos, sangrias, troco, porForma, esperadoDinheiro,
    vendido: vendas.reduce((t, v) => t + v.total, 0) };
}

export function relatorio(vendas) {
  const total = vendas.reduce((t, v) => t + v.total, 0);
  const servico = vendas.reduce((t, v) => t + (v.servico || 0), 0);
  const itens = new Map();
  for (const v of vendas) for (const i of v.itens) {
    const a = itens.get(i.nome) || { nome: i.nome, qtd: 0, valor: 0 };
    a.qtd += i.qtd; a.valor += i.preco * i.qtd;
    itens.set(i.nome, a);
  }
  const porTipo = { mesa: 0, balcao: 0, delivery: 0 };
  for (const v of vendas) porTipo[v.tipo] = (porTipo[v.tipo] || 0) + v.total;
  return {
    n: vendas.length, total, servico,
    ticketMedio: vendas.length ? Math.round(total / vendas.length) : 0,
    porTipo,
    maisVendidos: [...itens.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor).slice(0, 10),
    notas: vendas.filter((v) => v.nfce).length,
  };
}

// Itens ainda não mandados para a cozinha (a comanda guarda quanto de cada linha já foi).
export function pendentesCozinha(comanda) {
  return (comanda.itens || []).filter((i) => i.qtd > (i.enviado || 0) && i.cozinha !== false)
    .map((i) => ({ uid: i.uid, nome: i.nome, qtd: i.qtd - (i.enviado || 0), obs: i.obs || "" }));
}

export const CARDAPIO_EXEMPLO = {
  categorias: ["Pratos", "Lanches", "Porções", "Bebidas", "Sobremesas"],
  // NCM e CFOP de exemplo: quem define os do seu restaurante é o contador.
  itens: [
    { id: "p1", cat: "Pratos", nome: "Prato executivo (frango grelhado)", preco: 3290, ncm: "21069090", cfop: "5102" },
    { id: "p2", cat: "Pratos", nome: "Filé à parmegiana", preco: 5890, ncm: "21069090", cfop: "5102" },
    { id: "p3", cat: "Pratos", nome: "Risoto de cogumelos", preco: 4990, ncm: "21069090", cfop: "5102" },
    { id: "p4", cat: "Pratos", nome: "Salada da casa", preco: 2890, ncm: "21069090", cfop: "5102" },
    { id: "l1", cat: "Lanches", nome: "X-burguer artesanal", preco: 3490, ncm: "21069090", cfop: "5102" },
    { id: "l2", cat: "Lanches", nome: "Hambúrguer vegetariano", preco: 3290, ncm: "21069090", cfop: "5102" },
    { id: "o1", cat: "Porções", nome: "Batata frita", preco: 2490, ncm: "21069090", cfop: "5102" },
    { id: "o2", cat: "Porções", nome: "Polenta frita", preco: 2290, ncm: "21069090", cfop: "5102" },
    { id: "b1", cat: "Bebidas", nome: "Refrigerante lata", preco: 690, ncm: "22021000", cfop: "5405", cozinha: false },
    { id: "b2", cat: "Bebidas", nome: "Água sem gás", preco: 490, ncm: "22011000", cfop: "5405", cozinha: false },
    { id: "b3", cat: "Bebidas", nome: "Suco natural", preco: 1190, ncm: "20098990", cfop: "5102" },
    { id: "b4", cat: "Bebidas", nome: "Cerveja long neck", preco: 1290, ncm: "22030000", cfop: "5405", cozinha: false },
    { id: "s1", cat: "Sobremesas", nome: "Pudim", preco: 1490, ncm: "21069090", cfop: "5102" },
    { id: "s2", cat: "Sobremesas", nome: "Petit gâteau", preco: 2290, ncm: "21069090", cfop: "5102" },
  ],
};
