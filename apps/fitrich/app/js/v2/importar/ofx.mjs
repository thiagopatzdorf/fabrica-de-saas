// Leitor de OFX tolerante ao que os bancos brasileiros exportam.
//
// Realidade documentada em github.com/chiarelli-dev/ofx-br e conferida no extrato público do Banco
// do Brasil em alberteije/T2TiERP-1-Delphi (conciliacao_bancaria/.../ExtratoOFX.ofx):
// - OFX 1.x é SGML: tag folha SEM fechamento (`<TRNAMT>-150.00` e pronto). DOMParser quebra, então
//   o tokenizador aqui é próprio e também aceita OFX 2.x (XML, tags fechadas).
// - Cabeçalho `ENCODING:USASCII` + `CHARSET:1252` com bytes cp1252 de verdade, mas há banco que
//   salva UTF-8 com esse mesmo cabeçalho: tentamos UTF-8 estrito primeiro e caímos no CHARSET.
// - `DTPOSTED` como `20260702000000[-3:BRT]` ou só `20260702`: usamos a DATA LOCAL do banco e
//   ignoramos o fuso (converter para UTC vira o dia à meia-noite: o erro clássico).
// - `TRNAMT` às vezes com vírgula decimal e milhar com ponto (`1.234,56`).
// - `FITID` repetido: o banco reemite quando a transação muda de estado. Isso é assunto do
//   dedupe; aqui cada STMTTRN sai como veio.
//
// Regra do SGML que o tokenizador explora: agregados SEMPRE fecham (`</STMTTRN>`); só folhas podem
// não fechar. Então uma tag aberta sem texto é agregado se existe `</TAG>` em algum lugar do
// arquivo; senão é folha vazia. Isso resolve `<MEMO>` vazio seguido de `<NAME>` sem engolir o NAME.
import { charsetDeclaradoNosBytes, decodificar, lerCentavos, lerDataExtrato } from "./comum.mjs";

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function desentidar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

// Lê o cabeçalho OFX 1.x (`CHAVE:valor` por linha antes do primeiro `<`) ou a PI `<?OFX ...?>` da 2.x.
export function lerCabecalho(texto) {
  const cab = {};
  const i = texto.indexOf("<");
  const antes = i < 0 ? texto : texto.slice(0, i);
  for (const linha of antes.split(/\r?\n/)) {
    const r = /^([A-Z]+):\s*(.*)$/.exec(linha.trim());
    if (r) cab[r[1]] = r[2];
  }
  const pi = /<\?OFX\s([^?]*)\?>/i.exec(texto);
  if (pi) for (const [, k, v] of pi[1].matchAll(/([A-Z]+)="([^"]*)"/gi)) cab[k.toUpperCase()] = v;
  const xml = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(texto);
  if (xml) cab.CHARSET = cab.CHARSET ?? xml[1];
  return cab;
}

// Árvore mínima: { tag, filhos: [], texto }. Folha tem texto; agregado tem filhos.
export function tokenizar(texto) {
  const i = texto.indexOf("<");
  const corpo = i < 0 ? "" : texto.slice(i);
  const tokens = [...corpo.matchAll(/<\?[^>]*\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w.:-]*)\s*>([^<]*)/g)];
  const fecham = new Set();
  for (const t of tokens) if (t[1] === "/" && t[2]) fecham.add(t[2].toUpperCase());
  const raiz = { tag: "#raiz", filhos: [] };
  const pilha = [raiz];
  for (const t of tokens) {
    if (!t[2]) continue; // PI ou comentário
    const tag = t[2].toUpperCase(), texto = desentidar(t[3]).trim();
    if (t[1] === "/") {
      // fecha o agregado mais próximo com esse nome; fechamento de folha (XML) não está na pilha → ignora
      const pos = pilha.map((n) => n.tag).lastIndexOf(tag);
      if (pos > 0) pilha.length = pos;
      continue;
    }
    if (texto === "" && fecham.has(tag)) {
      const no = { tag, filhos: [] };
      pilha[pilha.length - 1].filhos.push(no);
      pilha.push(no);
    } else pilha[pilha.length - 1].filhos.push({ tag, texto });
  }
  return raiz;
}

const filho = (no, tag) => no.filhos?.find((f) => f.tag === tag);
const valor = (no, tag) => filho(no, tag)?.texto;
function acharTodos(no, tag, acc = []) {
  for (const f of no.filhos ?? []) { if (f.tag === tag) acc.push(f); acharTodos(f, tag, acc); }
  return acc;
}

// Lança um erro legível quando o arquivo não é OFX, para a UI dizer "isso não é um extrato OFX".
export function lerOFX(entrada) {
  const { texto, encoding } = decodificar(entrada, { charsetDeclarado: charsetDeclaradoNosBytes(entrada) });
  const cabecalho = lerCabecalho(texto);
  const raiz = tokenizar(texto);
  const ofx = acharTodos(raiz, "OFX")[0];
  if (!ofx) throw new Error("arquivo não tem a tag <OFX>");
  const avisos = [];
  const contas = [];
  for (const [tagRS, tagConta, tipo] of [["STMTRS", "BANKACCTFROM", "conta"], ["CCSTMTRS", "CCACCTFROM", "cartao"]]) {
    for (const rs of acharTodos(ofx, tagRS)) {
      const acct = filho(rs, tagConta) ?? { filhos: [] };
      const lista = filho(rs, "BANKTRANLIST") ?? { filhos: [] };
      const movimentos = [];
      for (const [i, trn] of acharTodos(lista, "STMTTRN").entries()) {
        const data = lerDataExtrato(valor(trn, "DTPOSTED"));
        const centavos = lerCentavos(valor(trn, "TRNAMT"));
        if (!data || centavos === null) { avisos.push({ codigo: "stmttrn_invalido", indice: i, dtposted: valor(trn, "DTPOSTED") ?? null, trnamt: valor(trn, "TRNAMT") ?? null }); continue; }
        const name = valor(trn, "NAME") ?? "", memo = valor(trn, "MEMO") ?? "";
        movimentos.push({
          data, valorCentavos: centavos,
          descricao: !memo ? name : !name || memo.toLowerCase().includes(name.toLowerCase()) ? memo : `${name} ${memo}`,
          fitid: valor(trn, "FITID") ?? null,
          tipoBanco: valor(trn, "TRNTYPE") ?? null,
          name, memo,
          checknum: valor(trn, "CHECKNUM") ?? null,
          refnum: valor(trn, "REFNUM") ?? null,
        });
      }
      const ledger = filho(rs, "LEDGERBAL");
      contas.push({
        tipo,
        acctid: valor(acct, "ACCTID") ?? null,
        bankid: valor(acct, "BANKID") ?? null,
        branchid: valor(acct, "BRANCHID") ?? null,
        accttype: valor(acct, "ACCTTYPE") ?? null,
        moeda: valor(rs, "CURDEF") ?? "BRL",
        periodo: { inicio: lerDataExtrato(valor(lista, "DTSTART")), fim: lerDataExtrato(valor(lista, "DTEND")) },
        saldo: ledger ? { centavos: lerCentavos(valor(ledger, "BALAMT")), data: lerDataExtrato(valor(ledger, "DTASOF")) } : null,
        movimentos,
      });
    }
  }
  if (!contas.length) avisos.push({ codigo: "sem_extrato" });
  const sonrs = acharTodos(ofx, "SONRS")[0];
  return {
    versao: /^2/.test(cabecalho.OFXHEADER ?? "") || /<\?xml/i.test(texto) ? "2" : "1",
    encoding, cabecalho,
    instituicao: sonrs ? { org: valor(filho(sonrs, "FI") ?? {}, "ORG") ?? null, fid: valor(filho(sonrs, "FI") ?? {}, "FID") ?? null } : null,
    contas, avisos,
  };
}

// Atalho para a UI: todos os movimentos de todas as contas do arquivo, com o acctid ao lado.
export const movimentosDoOFX = (lido) => lido.contas.flatMap((c) => c.movimentos.map((m) => ({ ...m, acctid: c.acctid, tipoConta: c.tipo })));
