import Link from "next/link";
import { redirect } from "next/navigation";
import { Target, TrendingUp } from "lucide-react";

import { auth } from "@/auth";
import { getUserProgressSummary } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function ProgressoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { byContest, overall } = await getUserProgressSummary(session.user.id);
  const overallAccuracy =
    overall.totalAnswered > 0
      ? Math.round((overall.totalCorrect / overall.totalAnswered) * 100)
      : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Meu progresso</h1>
        <p className="text-muted-foreground text-sm">
          Acompanhe seu desempenho por matéria em cada concurso.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-4 pt-6 text-center">
          <div>
            <p className="text-2xl font-bold">{overall.totalAnswered}</p>
            <p className="text-muted-foreground text-xs">Questões respondidas</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{overall.totalCorrect}</p>
            <p className="text-muted-foreground text-xs">Acertos</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{overallAccuracy}%</p>
            <p className="text-muted-foreground text-xs">Aproveitamento geral</p>
          </div>
        </CardContent>
      </Card>

      {byContest.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Target className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">
              Você ainda não respondeu nenhuma questão. Escolha um concurso e comece a praticar.
            </p>
            <Button asChild>
              <Link href="/concursos">Ver concursos</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {byContest.map(({ contest, subjects, totalAnswered, totalCorrect }) => {
            const accuracy =
              totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
            return (
              <Card key={contest.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{contest.name}</CardTitle>
                    <Badge variant={accuracy >= 60 ? "success" : "warning"}>
                      {accuracy}% de acerto
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {subjects
                    .sort((a, b) => b.totalAnswered - a.totalAnswered)
                    .map((s) => {
                      const subjectAccuracy =
                        s.totalAnswered > 0
                          ? Math.round((s.totalCorrect / s.totalAnswered) * 100)
                          : 0;
                      return (
                        <div key={s.id} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-sm">
                            <span>{s.subject.name}</span>
                            <span className="text-muted-foreground">
                              {s.totalCorrect}/{s.totalAnswered} ({subjectAccuracy}%)
                            </span>
                          </div>
                          <Progress value={subjectAccuracy} />
                        </div>
                      );
                    })}
                  <Button asChild size="sm" variant="outline" className="mt-2 w-fit">
                    <Link href={`/minha-chance?concurso=${contest.slug}`}>
                      <TrendingUp />
                      Ver chance de passar
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
