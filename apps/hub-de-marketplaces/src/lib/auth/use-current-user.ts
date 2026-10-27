import { authClient } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export type CurrentUserState = {
  /** `null` enquanto a sessão carrega E quando não há login: confira `isPending`. */
  user: AppUser | null;
  isPending: boolean;
};

/**
 * Usuário atual + estado de carregamento. Para proteger rota, espere `isPending`
 * acabar antes de redirecionar, senão quem já está logado volta ao login a cada recarga.
 */
export function useCurrentUserState(): CurrentUserState {
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
        }
      : null,
    isPending,
  };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
