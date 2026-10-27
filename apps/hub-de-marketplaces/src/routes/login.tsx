import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Boot, useHydrated } from "@/components/boot";
import { Button, Field } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const hydrated = useHydrated();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (!hydrated || isPending) return <Boot />;
  if (user) return <Navigate to="/" />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("A senha precisa de 8 caracteres.");
      return;
    }
    setPending(true);
    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name: name || email })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Não foi possível entrar.");
      return;
    }
    await navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-16 text-fg">
      <div className="w-full max-w-sm">
        <p className="font-display text-xs font-semibold tracking-brand text-fg">HUB DE MARKETPLACES</p>
        <p className="mt-2 text-xs text-muted">Multi-canal</p>
        <h1 className="mt-10 font-display text-3xl">Um cadastro, vários canais.</h1>
        <p className="mt-4 text-sm text-muted">
          Catálogo, preço, estoque, anúncios, pedidos, nota e expedição num só lugar.
        </p>
        <p className="mt-8 text-sm text-muted">
          Crie um acesso para começar. A primeira abertura traz uma organização de demonstração com dados fictícios.
        </p>
        <form className="mt-8 space-y-4" onSubmit={(event) => void submit(event)}>
          {mode === "up" ? <Field label="Nome" value={name} onChange={setName} /> : null}
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <Field label="Senha" value={password} onChange={setPassword} type="password" hint="Mínimo de 8 caracteres." />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button variant="primary" type="submit" disabled={pending} className="w-full">
            {pending ? "Aguarde…" : mode === "up" ? "Criar acesso" : "Entrar"}
          </Button>
          <button
            type="button"
            className="text-sm text-muted"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError("");
            }}
          >
            {mode === "in" ? "Criar acesso" : "Já tenho acesso"}
          </button>
        </form>
      </div>
    </main>
  );
}
