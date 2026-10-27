import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { auth } from "@/auth";
import { getContestPrediction, getContests } from "@/lib/queries";
import { PREDICTION_WEIGHTS, VOLUME_TARGET_QUESTIONS } from "@/lib/prediction";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ContestPicker } from "@/components/prediction/contest-picker";

function chanceVariant(chance: number): "success" | "warning" | "destructive" {
  if (chance >= 60) return "success";
  if (chance >= 35) return "warning";
  return "destructive";
}

export default async function MinhaChancePage({
  searchParams,
}: {
  searchParams: Promise<{ concurso?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { concurso } = await searchParams;
  const contests = await getContests();

  if (contests.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-muted-foreground">Nenhum concurso cadastrado ainda.</p>
      </div>
    );
  }

  const selectedContest = contests.find((c) => c.slug === concurso) ?? contests[0];
  const prediction = await getContestPrediction(session.user.id, selectedContest.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Minha chance de passar</h1>
        <p className="text-muted-foreground text-sm">
          Uma estimativa transparente, baseada no seu desempenho — não é mágica, é matemática simples.
        </p>
      </div>

      <ContestPicker
        contests={contests.map((c) => ({ slug: c.slug, name: c.name }))}
        selectedSlug={selectedContest.slug}
      />

      {prediction.totalAnswered === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="text-muted-foreground size-8" />
            <p className="text-muted-foreground text-sm">
              Você ainda não respondeu nenhuma questão de {selectedContest.name}. Resolva algumas
              questões para calcularmos sua chance.
            </p>
            <Button asChild>
              <Link href={`/concursos/${selectedContest.slug}/questoes`}>Resolver questões</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="items-center text-center">
              <CardDescription>{selectedContest.name}</CardDescription>
              <CardTitle className="text-6xl font-bold">
                {prediction.chancePercent}%
              </CardTitle>
              <Badge variant={chanceVariant(prediction.chancePercent)}>
                chance estimada de aprovação
              </Badge>
            </CardHeader>
            <CardContent>
              <Progress
                value={prediction.chancePercent}
                className="h-3"
                indicatorClassName={
                  chanceVariant(prediction.chancePercent) === "success"
                    ? "bg-success"
                    : chanceVariant(prediction.chancePercent) === "warning"
                      ? "bg-warning"
                      : "bg-destructive"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como chegamos nesse número</CardTitle>
              <CardDescription>
                A chance é uma média ponderada de três fatores do seu desempenho neste concurso.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <BreakdownRow
                label="Acerto por matéria (ponderado pelo peso no edital)"
                value={prediction.breakdown.weightedAccuracy}
                weight={PREDICTION_WEIGHTS.weightedAccuracy}
              />
              <BreakdownRow
                label={`Volume de questões praticadas (meta: ${VOLUME_TARGET_QUESTIONS})`}
                value={prediction.breakdown.volume}
                weight={PREDICTION_WEIGHTS.volume}
              />
              <BreakdownRow
                label="Consistência nas últimas respostas"
                value={prediction.breakdown.consistency}
                weight={PREDICTION_WEIGHTS.consistency}
              />
            </CardContent>
          </Card>

          {prediction.weakSubjects.length > 0 ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Pontos fracos que mais pesam contra você</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 flex flex-col gap-1">
                  {prediction.weakSubjects.map((s) => (
                    <li key={s.subjectId}>
                      <strong>{s.subjectName}</strong> vale {s.weight}% da prova e seu
                      aproveitamento é de {Math.round(s.accuracy * 100)}%
                      {s.totalAnswered === 0 ? " (ainda não praticada)" : ""}. Foque aqui para
                      subir sua chance mais rápido.
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button asChild variant="outline">
            <Link href={`/concursos/${selectedContest.slug}/questoes`}>
              Continuar praticando {selectedContest.name}
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {value}% · peso {Math.round(weight * 100)}%
        </span>
      </div>
      <Progress value={value} />
    </div>
  );
}
