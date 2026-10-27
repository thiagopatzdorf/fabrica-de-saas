import { createAuthClient } from "better-auth/react";

/**
 * Cliente Better Auth do navegador. Fala com `/api/auth/*` na mesma origem; o
 * cookie de sessão acompanha toda chamada, inclusive as server functions.
 */
export const authClient = createAuthClient();

/** Encerra a sessão e volta para `redirectTo`. Rejeita se o servidor não confirmar. */
export async function signOut(redirectTo = "/login"): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(error.message ?? "Não foi possível sair.");
  window.location.href = redirectTo;
}
