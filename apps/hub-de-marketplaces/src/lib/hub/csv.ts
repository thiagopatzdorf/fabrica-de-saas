export const CSV_TEMPLATE = [
  "sku,ean,titulo,descricao,marca,ncm,peso_g,altura_cm,largura_cm,comprimento_cm,custo,preco,estoque,seguranca,categoria,tipo",
  "EXEMPLO-MOCHILA,7890000000099,Mochila exemplo 16L,Linha de importação.,Norte,42029200,600,40,28,14,89.90,189.90,10,2,Mochilas,simples",
].join("\n");

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      current.push(field);
      field = "";
    } else if (char === "\n") {
      current.push(field);
      field = "";
      if (current.some((cell) => cell.trim())) rows.push(current);
      current = [];
    } else field += char;
  }
  if (field.length || current.length) {
    current.push(field);
    if (current.some((cell) => cell.trim())) rows.push(current);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (row[index] ?? "").trim();
    });
    return record;
  });
}
