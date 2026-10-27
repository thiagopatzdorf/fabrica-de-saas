// A ÚNICA peça que sabe quem cobra. Fala com um serviço de "links de pagamento" (o produto `links-de-pagamento` deste repositório,
// ou qualquer outro que siga o mesmo contrato). Migrar para outro meio de pagamento é escrever outro arquivo com estas duas funções;
// o resto da loja não conhece o provedor.
//   criarCobranca({ ref, descricao, valor, retorno }) -> { url }
//   situacao(ref) -> { pago: boolean }
//
// Contrato HTTP esperado do provedor (PAGAR_URL + PAGAR_TOKEN):
//   POST {PAGAR_URL}/api/links            Authorization: Bearer <PAGAR_TOKEN>
//        corpo { descricao, valor (centavos), ref, retorno (https) }  ->  201 { url }
//        o mesmo `ref` deve devolver o mesmo link (idempotente)
//   GET  {PAGAR_URL}/api/links/ref/<ref>  Authorization: Bearer <PAGAR_TOKEN>
//        ->  200 { pago: boolean }  |  404 se o ref não existe
const prazo = () => AbortSignal.timeout(15_000);

function base(env) {
  if (!env.PAGAR_URL || !env.PAGAR_TOKEN) throw new Error("pagamento não configurado");
  return { url: env.PAGAR_URL.replace(/\/+$/, ""), cab: { authorization: `Bearer ${env.PAGAR_TOKEN}`, "content-type": "application/json" } };
}

export async function criarCobranca(env, { ref, descricao, valor, retorno }) {
  const { url, cab } = base(env);
  const r = await fetch(`${url}/api/links`, { method: "POST", headers: cab, body: JSON.stringify({ descricao, valor, ref, retorno }), signal: prazo() });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || typeof corpo.url !== "string") throw new Error(`pagamento recusado (${r.status})`);
  return { url: corpo.url };
}

export async function situacao(env, ref) {
  const { url, cab } = base(env);
  const r = await fetch(`${url}/api/links/ref/${encodeURIComponent(ref)}`, { headers: cab, signal: prazo() });
  if (r.status === 404) return { pago: false };
  if (!r.ok) throw new Error(`pagamento sem resposta (${r.status})`);
  return { pago: (await r.json()).pago === true };
}
