"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { emailSchema } from "@/lib/validation";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/concursos" });
}

export async function signInWithEmail(
  _prevState: { error?: string } | undefined,
  formData: FormData
) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: "Informe um e-mail válido." };
  }
  const email = parsed.data;

  try {
    await signIn("nodemailer", {
      email,
      redirectTo: "/login/verifique-seu-email",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Não foi possível enviar o link. Verifique o e-mail informado." };
    }
    throw error;
  }

  return {};
}
