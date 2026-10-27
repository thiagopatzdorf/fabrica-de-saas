import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";

import { signInWithGoogle } from "./actions";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/concursos");
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Entrar no Banco de Questões</CardTitle>
          <CardDescription>
            Resolva questões, acompanhe seu progresso e descubra sua chance de
            passar. É grátis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={signInWithGoogle}>
            <Button type="submit" className="w-full" variant="default">
              Continuar com Google
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">ou</span>
            <Separator className="flex-1" />
          </div>

          <EmailSignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
