import Link from "next/link";
import { BarChart3, FileQuestion, TrendingUp } from "lucide-react";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: FileQuestion,
    title: "Banco de questões",
    description: "Questões de exemplo (fictícias) de vários concursos, filtradas por matéria.",
  },
  {
    icon: BarChart3,
    title: "Progresso por matéria",
    description: "Veja seu aproveitamento em cada matéria e identifique onde estudar mais.",
  },
  {
    icon: TrendingUp,
    title: "Chance de passar",
    description: "Uma estimativa clara e transparente da sua chance de aprovação em cada concurso.",
  },
];

export default async function Home() {
  const session = await auth();

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Passa<span className="text-primary">Aí</span>
        </h1>
        <p className="text-muted-foreground max-w-lg text-lg">
          Estude para concursos públicos de graça: resolva questões, acompanhe seu progresso e
          descubra sua chance real de passar.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href={session?.user ? "/concursos" : "/login"}>
              {session?.user ? "Ver concursos" : "Começar agora, é grátis"}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="text-left">
            <CardHeader>
              <Icon className="text-primary size-6" />
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </div>
  );
}
