import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX className="text-muted-foreground size-10" />
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        O conteúdo que você procura não existe ou foi removido.
      </p>
      <Button asChild>
        <Link href="/">Voltar para o início</Link>
      </Button>
    </div>
  );
}
