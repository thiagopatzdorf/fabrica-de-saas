// Cliente HTTP mínimo: sempre JSON, cookie de sessão HttpOnly, erro do servidor vira mensagem legível.
export class ErroApi extends Error {
  constructor(mensagem, status, dados) { super(mensagem); this.status = status; this.dados = dados; }
}

function mensagem(det) {
  if (typeof det === 'string') return det;
  if (Array.isArray(det)) return det.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('; ');
  if (det && det.mensagem) return det.mensagem + (det.faltando ? `: ${det.faltando.join(', ')}` : '');
  return 'Erro inesperado. Tente novamente.';
}

export async function api(metodo, url, corpo, { semLogin = false } = {}) {
  const init = { method: metodo, credentials: 'same-origin', headers: {} };
  if (corpo instanceof FormData) init.body = corpo;
  else if (corpo !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corpo); }
  const r = await fetch(url, init);
  if (r.status === 401 && !semLogin) window.dispatchEvent(new Event('sessao-expirada'));
  const json = (r.headers.get('content-type') || '').includes('json');
  const dados = json ? await r.json() : null;
  if (!r.ok) throw new ErroApi(mensagem(dados && dados.detail), r.status, dados);
  return dados;
}

export const get = (u) => api('GET', u);
export const post = (u, c = {}) => api('POST', u, c);
export const patch = (u, c) => api('PATCH', u, c);
export const put = (u, c) => api('PUT', u, c);
export const del = (u) => api('DELETE', u);

export function query(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== false && v !== 0) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
