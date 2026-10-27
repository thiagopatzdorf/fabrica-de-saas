import { useSyncExternalStore, type ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function subscribe() {
  return () => {};
}

export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function Boot() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div>
        <p className="font-display text-xs font-semibold tracking-brand">HUB DE MARKETPLACES</p>
        <p className="mt-2 text-sm text-muted">Carregando…</p>
      </div>
    </main>
  );
}

export function AppGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const { user, isPending } = useCurrentUserState();
  if (!hydrated || isPending) return <Boot />;
  if (!user) return <RedirectToSignIn />;
  return <>{children}</>;
}
