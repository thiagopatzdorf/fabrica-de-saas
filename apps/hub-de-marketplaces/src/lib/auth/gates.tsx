import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { signOut } from "./client";
import { useCurrentUser } from "./use-current-user";

/** Para onde `RedirectToSignIn` manda quem não está logado. */
export const SIGN_IN_PATH = "/login";

/** Redireciona (sem recarregar a página) para a tela de login. */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/** Identidade do usuário logado + botão de sair. */
export function UserButton() {
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Conta";
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          // Sucesso navega para fora; em falha libera o botão para tentar de novo.
          void signOut().catch(() => setSigningOut(false));
        }}
        className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline"
      >
        {signingOut ? "Saindo…" : "Sair"}
      </button>
    </div>
  );
}
