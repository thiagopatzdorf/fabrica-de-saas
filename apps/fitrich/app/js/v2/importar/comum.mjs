// Peças comuns da importação: decodificar bytes, ler dinheiro e datas como os bancos escrevem,
// normalizar descrição. Tudo puro, sem DOM e sem rede: o arquivo chega como ArrayBuffer/texto
// e nada sai daqui.

// Decodifica bytes de extrato. Primeiro tenta UTF-8 ESTRITO (fatal): se os bytes forem UTF-8 de
// verdade, cabe. Se falhar, cai para o charset declarado (OFX `CHARSET:1252`, CSV sem declaração)
// que na prática é windows-1252. Motivo: o cabeçalho OFX brasileiro diz `ENCODING:USASCII` e
// `CHARSET:1252` ao mesmo tempo, e há bancos que salvam UTF-8 com esse mesmo cabeçalho
// (github.com/chiarelli-dev/ofx-br). Confiar só no rótulo troca "São" por "SÃ£o".
export function decodificar(entrada, { charsetDeclarado = null, TextDecoderImpl = globalThis.TextDecoder } = {}) {
  if (typeof entrada === "string") return { texto: entrada.replace(/^﻿/, ""), encoding: "texto" };
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  try {
    return { texto: new TextDecoderImpl("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    const nome = charsetParaDecoder(charsetDeclarado);
    return { texto: nome === "windows-1252" ? decodificarCp1252(bytes) : new TextDecoderImpl(nome).decode(bytes), encoding: nome };
  }
}

// windows-1252 à mão: byte < 0x80 ou ≥ 0xA0 é o próprio code point (igual ao latin1); 0x80–0x9F é a
// tabela abaixo (WHATWG Encoding, index windows-1252). Não usamos TextDecoder("windows-1252")
// porque o ICU do Node 22 devolve controle C1 para 0x96 ("–") enquanto Node 18 e navegadores
// devolvem o traço: o mesmo arquivo lido de dois jeitos quebraria a chave de dedupe.
const CP1252_80_9F = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
  0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
export function decodificarCp1252(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += String.fromCharCode(b >= 0x80 && b <= 0x9f ? CP1252_80_9F[b - 0x80] : b);
  }
  return s;
}

// `1252`, `CP1252`, `windows-1252`, `ISO-8859-1`, `latin1` → windows-1252 (superconjunto prático do
// latin1 no TextDecoder). Qualquer outra coisa também vira windows-1252: é o que os bancos usam.
export function charsetParaDecoder(charset) {
  const c = String(charset ?? "").trim().toLowerCase();
  if (/utf-?8/.test(c)) return "utf-8";
  return "windows-1252";
}

// Lê o começo dos bytes como ASCII para achar o charset declarado (cabeçalho OFX ou `<?xml encoding`).
export function charsetDeclaradoNosBytes(entrada) {
  if (typeof entrada === "string") return null;
  const bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  let inicio = "";
  for (let i = 0; i < Math.min(bytes.length, 600); i++) inicio += String.fromCharCode(bytes[i]);
  const xml = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(inicio);
  if (xml) return xml[1];
  const cs = /^CHARSET:\s*(\S+)/im.exec(inicio);
  if (cs && cs[1].toUpperCase() !== "NONE") return cs[1];
  const enc = /^ENCODING:\s*(\S+)/im.exec(inicio);
  return enc ? enc[1] : null;
}

// Dinheiro como texto → centavos INTEIROS com sinal, sem passar por ponto flutuante.
// Aceita: "-150.00", "1.234,56", "1,234.56", "R$ 12", "-R$ 45,90", "(99,90)" (negativo contábil),
// "- 1500,00" (espaço depois do sinal, Nubank cartão), "+150", "94,59", "1234". null se não for dinheiro.
// Estende `lerReais` do v1 (que recusa zero e negativo, porque lá o usuário digita o módulo).
export function lerCentavos(texto) {
  let s = String(texto ?? "").replace(/R\$|BRL|\s| /g, "");
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); }
  if (/^[-−–]/.test(s)) { negativo = !negativo; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { negativo = !negativo; s = s.slice(0, -1); } // "150,00-" (alguns extratos)
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const v = s.lastIndexOf(","), p = s.lastIndexOf(".");
  let inteiro, fracao = "";
  if (v >= 0 && p >= 0) {
    // os dois presentes: o que vem por último é o decimal
    const dec = Math.max(v, p);
    inteiro = s.slice(0, dec).replace(/[.,]/g, ""); fracao = s.slice(dec + 1);
  } else if (v >= 0) {
    // só vírgula: "1,234" com exatamente 3 dígitos depois é ambíguo; no Brasil vírgula é decimal,
    // mas "1,234,567" (duas vírgulas) é milhar inglês.
    if (s.split(",").length > 2 || /^\d{1,3}(,\d{3})+$/.test(s)) inteiro = s.replace(/,/g, ""); // "1,234" (milhar inglês): dinheiro nunca tem 3 decimais
    else { inteiro = s.slice(0, v); fracao = s.slice(v + 1); }
  } else if (p >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) inteiro = s.replace(/\./g, ""); // "1.234" = mil duzentos e trinta e quatro
    else if (s.split(".").length > 2) return null;
    else { inteiro = s.slice(0, p); fracao = s.slice(p + 1); }
  } else inteiro = s;
  if (!/^\d*$/.test(inteiro) || !/^\d{0,2}$/.test(fracao) || (!inteiro && !fracao)) return null;
  const c = Number(inteiro || "0") * 100 + Number(fracao.padEnd(2, "0"));
  if (!Number.isSafeInteger(c)) return null;
  return negativo ? -c : c;
}

// Data como os extratos escrevem → "AAAA-MM-DD" ou null. Aceita "DD/MM/AAAA", "DD/MM/AA" (20AA),
// "AAAA-MM-DD", "DD-MM-AAAA", "AAAAMMDD" (OFX, com qualquer sufixo de hora/fuso) e hora depois
// ("02/07/2026 14:35"). A data é a LOCAL do banco: nunca convertemos fuso (converter vira o dia).
export function lerDataExtrato(texto) {
  const s = String(texto ?? "").trim();
  let a, m, d, r;
  if ((r = /^(\d{4})(\d{2})(\d{2})(?:\d{6}(?:\.\d{3})?)?(?:\[[^\]]*\])?$/.exec(s))) [, a, m, d] = r;
  else if ((r = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s))) [, a, m, d] = r;
  else if ((r = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s.*)?$/.exec(s))) [, d, m, a] = r;
  else if ((r = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})(?:\s.*)?$/.exec(s))) { [, d, m] = r; a = "20" + r[3]; }
  else return null;
  const iso = `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = Date.parse(iso + "T00:00:00Z");
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : null; // recusa 31/02
}

// Minúsculas, sem acento, espaços colapsados. É a forma usada em chave de dedupe e em regra de
// categoria: "PÃO DE AÇÚCAR" e "Pao de Acucar" são o mesmo estabelecimento.
export function normalizarTexto(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export const somarDiasISO = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const diasEntreISO = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// SHA-256 em hex. `digest` é injetável: no navegador é `crypto.subtle.digest`; em Node 18
// `globalThis.crypto` não existe sem flag, então o teste passa `webcrypto.subtle.digest` de node:crypto.
export async function sha256Hex(entrada, digest = digestPadrao) {
  const bytes = typeof entrada === "string" ? new TextEncoder().encode(entrada) : entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
  const buf = await digest(bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
export function digestPadrao(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("crypto.subtle indisponível: injete `digest`");
  return subtle.digest("SHA-256", bytes);
}
