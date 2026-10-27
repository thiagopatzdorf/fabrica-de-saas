import Link from "next/link";
import { Building2, CalendarDays, FileQuestion } from "lucide-react";

import { getContests } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(
    date
  );
}

export default async function ConcursosPage() {
  const contests = await getContests();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Concursos</h1>
        <p className="text-muted-foreground text-sm">
          Escolha um concurso para resolver questões e acompanhar sua chance de passar.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {contests.map((contest) => (
          <Link key={contest.id} href={`/concursos/${contest.slug}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{contest.name}</CardTitle>
                  <Badge variant="secondary">{contest.examBoard}</Badge>
                </div>
                <CardDescription className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {contest.organization}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <FileQuestion className="size-4" />
                  {contest._count.questions} questões
                </span>
                {contest.examDate ? (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-4" />
                    Prova em {formatDate(contest.examDate)}
                  </span>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
