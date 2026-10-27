// Fotos de progresso LOCAIS: ficam num banco IndexedDB próprio (`fitrich-fotos`), separado do documento do Fitrich.
// Por isso NUNCA entram no backup JSON, no arquivo de sincronia nem em rede alguma: saem do aparelho só se a pessoa
// as exportar de lá. Adaptador injetável (o de memória serve aos testes). Cada foto: { id, data (ISO), nota, blob }.
const NOME = "fitrich-fotos", STORE = "fotos";
const pedido = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function criarFotosIDB(indexedDB) {
  if (!indexedDB) throw new Error("sem indexedDB");
  let db = null;
  const abrir = async () => {
    if (db) return db;
    const req = indexedDB.open(NOME, 1);
    req.onupgradeneeded = () => { const s = req.result.createObjectStore(STORE, { keyPath: "id" }); s.createIndex("data", "data", { unique: false }); };
    db = await pedido(req);
    db.onversionchange = () => { db.close(); db = null; };
    return db;
  };
  const store = async (modo) => (await abrir()).transaction(STORE, modo).objectStore(STORE);
  return {
    tipo: "idb",
    async listar() { return ordenarFotos(await pedido((await store("readonly")).getAll())); },
    async adicionar(foto) { await pedido((await store("readwrite")).put(foto)); return foto; },
    async remover(id) { await pedido((await store("readwrite")).delete(id)); },
    async limpar() { await pedido((await store("readwrite")).clear()); },
  };
}
export function criarFotosMemoria() {
  const m = new Map();
  return {
    tipo: "memoria",
    async listar() { return ordenarFotos([...m.values()]); },
    async adicionar(foto) { m.set(foto.id, foto); return foto; },
    async remover(id) { m.delete(id); },
    async limpar() { m.clear(); },
  };
}
export const ordenarFotos = (l) => [...l].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : 1));
// IndexedDB indisponível (janela privativa, bloqueio): a tela mostra aviso e segue sem fotos, nunca quebra.
export function abrirFotos(indexedDB = globalThis.indexedDB) { try { return criarFotosIDB(indexedDB); } catch { return null; } }

// Reduz a foto no aparelho (lado maior ≤ `max` px, JPEG): 5 MB de câmera viram ~200 KB e a EXIF de localização some,
// porque o canvas só carrega pixels. Só no navegador (precisa de createImageBitmap e canvas).
export async function reduzirImagem(arquivo, { max = 1280, qualidade = 0.85, doc = globalThis.document } = {}) {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = doc.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("sem_blob"))), "image/jpeg", qualidade));
}
