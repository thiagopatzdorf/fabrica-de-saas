import { MailCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyRequestPage() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <MailCheck className="text-primary mb-2 size-10" />
          <CardTitle>Verifique seu e-mail</CardTitle>
          <CardDescription>
            Enviamos um link de acesso. Abra seu e-mail e clique no link para
            entrar no Banco de Questões.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
