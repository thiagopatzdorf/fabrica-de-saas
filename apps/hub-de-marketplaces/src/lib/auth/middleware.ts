import { createMiddleware } from "@tanstack/react-start";

/**
 * Middleware das server functions: entrega o id verificado do usuário em
 * `context.userId`. Toda server function que toca dados por organização usa isto
 * e filtra a consulta por esse id (a organização é resolvida a partir dele).
 *
 * Sem sessão, lança `UnauthorizedError` (mensagem "Unauthorized").
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Import dinâmico: `*.server` não pode ir para o bundle do navegador.
  const { requireUserId } = await import("./verify.server");
  const userId = await requireUserId();
  return next({ context: { userId } });
});
