// Regras puras do Ponto Eletrônico (sem banco, sem rede): CPF, distância à cerca, semelhança de rosto e veredito.
// Ficam aqui para os testes cobrirem cada uma sem montar o Worker.

export function cpfValido(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const soDigitos = (s) => String(s || "").replace(/\D/g, "");
export const cpfFormatado = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
export function cnpjValido(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, i) => a + Number(d[i]) * p, 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

// Distância em metros entre dois pontos (haversine). Precisão de sobra para cerca de dezenas de metros.
export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (g) => (g * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Mesma conta de `human.match.similarity` (biblioteca @vladmandic/human 3.3.6, MIT): distância
// euclidiana ao quadrado x25, raiz, e normalização entre 0,2 e 0,8. O celular calcula o vetor;
// a comparação é feita AQUI, contra o modelo guardado, que nunca sai do servidor.
export function semelhanca(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length < 64) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  const dist = Math.round(100 * 25 * s) / 100;
  if (dist === 0) return 1;
  const v = (1 - Math.sqrt(dist) / 100 - 0.2) / (0.8 - 0.2);
  return Math.round(100 * Math.max(Math.min(v, 1), 0)) / 100;
}

// Medido em 2026-10-21 (19 rostos, 171 pares): pessoas diferentes chegaram a 0,49; a mesma pessoa
// em foto ruim ficou com mediana 0,42. As faixas se sobrepõem, então o rosto não decide sozinho:
// acima do limiar registra; na faixa cinza registra marcando "revisar" (o RH vê a foto); abaixo recusa.
// "Pessoa real" (modelo antifoto): medido em 2026-10-21, foto parada mostrada à câmera tirou 0,41 a 0,44 e
// rostos em foto direta 0,50 a 0,76. Margem pequena: o mínimo é por empresa (calibra com dado de campo)
// e o desafio de piscar, no celular, é a segunda trava contra foto.
export const REAL_MINIMO = 0.45;
export function veredito({ semelhanca: s, real }, { limiar = 0.55, limiar_revisao = 0.42, real_minimo = REAL_MINIMO } = {}) {
  if (!(real >= real_minimo)) return { ok: false, motivo: "Não deu para confirmar que é uma pessoa na frente da câmera. Tente de novo com boa luz, olhando para a câmera." };
  if (s >= limiar) return { ok: true, revisar: false };
  if (s >= limiar_revisao) return { ok: true, revisar: true };
  return { ok: false, motivo: "O rosto não confere com o cadastrado. Tente de novo com boa luz ou peça ao RH um novo cadastro." };
}

export const VETOR_TAMANHO = 1024;
export const vetorValido = (v) => Array.isArray(v) && v.length === VETOR_TAMANHO && v.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 10);
