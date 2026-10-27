import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./server";

/**
 * Resolução de sessão no servidor. O cookie de sessão chega em toda chamada, então
 * o usuário vem direto de `auth.api.getSession`. Nunca confie em id enviado pelo cliente.
 */

/** Lançado por `requireUserId` sem sessão válida. A mensagem é um contrato estável. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/** O usuário logado na requisição atual, ou `null`. */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/** Id do usuário logado, ou `UnauthorizedError`. */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}
