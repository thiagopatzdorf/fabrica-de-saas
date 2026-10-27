// Armazenamento persistente: o navegador PODE apagar o IndexedDB com pouco espaço ou, no WebKit, depois de
// 7 dias sem uso. `storage.persist()` pede para não apagar; o navegador decide e muitas vezes recusa em
// silêncio. Por isso o aviso é honesto: quando não há garantia, diz isso e aponta o backup.
export async function lerPersistencia(nav = globalThis.navigator) {
  const s = nav?.storage;
  let persistido = null, usoBytes = null, cotaBytes = null;
  try { if (typeof s?.persisted === "function") persistido = Boolean(await s.persisted()); } catch { /* sem resposta */ }
  try { if (typeof s?.estimate === "function") { const e = await s.estimate(); usoBytes = e.usage ?? null; cotaBytes = e.quota ?? null; } } catch { /* idem */ }
  return { suporte: typeof s?.persist === "function", persistido, usoBytes, cotaBytes };
}

export async function pedirPersistencia(nav = globalThis.navigator) {
  try { if (typeof nav?.storage?.persist === "function") return Boolean(await nav.storage.persist()); } catch { /* recusou */ }
  return false;
}

// Código para a UI traduzir. `precisaAviso` só vale depois do primeiro registro.
//   ok            o navegador prometeu guardar
//   ios_instale   WebKit sem instalar: dados somem após 7 dias sem abrir; instalar na tela inicial isenta
//   nao_concedido o navegador recusou (ou ainda não decidiu): sem garantia, faça backup
//   sem_suporte   o navegador nem expõe a API
export function avaliarPersistencia({ persistido, suporte = true, plataforma, registros = 0 }) {
  let codigo;
  if (persistido === true) codigo = "ok";
  else if (!suporte && persistido == null) codigo = "sem_suporte";
  else if (plataforma?.webkitNaoInstalado) codigo = "ios_instale";
  else codigo = "nao_concedido";
  return { codigo, precisaAviso: codigo !== "ok" && registros >= 1 };
}
