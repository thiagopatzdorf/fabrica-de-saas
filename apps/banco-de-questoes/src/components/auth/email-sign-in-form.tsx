"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";

import { signInWithEmail } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailSignInForm() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="voce@exemplo.com"
          required
        />
      </div>
      {state?.error ? (
        <p className="text-destructive text-sm">{state.error}</p>
      ) : null}
      <Button type="submit" variant="outline" disabled={isPending}>
        <Mail />
        {isPending ? "Enviando..." : "Continuar com e-mail (link mágico)"}
      </Button>
    </form>
  );
}
