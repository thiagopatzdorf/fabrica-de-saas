import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Scale, TrendingUp } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getContestBySlug } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function formatDate(date: Date | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
    date
  );
}

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const contest = await getContestBySlug(slug);
  if (!contest) notFound();

  const session = await auth();
  const progressBySubject = new Map<string, { totalAnswered: number; totalCorrect: number }>();
  if (session?.user) {
    const progress = await prisma.userProgress.findMany({
      where: { userId: session.user.id, contestId: contest.id },
    });
    for (const p of progress) {
      progressBySubject.set(p.subjectId, p);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">{contest.name}</h1>
          <Badge variant="secondary">{contest.examBoard}</Badge>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Building2 className="size-4" />
          {contest.organization}
        </p>
        {contest.examDate ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <CalendarDays className="size-4" />
            Prova prevista para {formatDate(contest.examDate)}
          </p>
        ) : null}
        {contest.description ? (
          <p className="text-sm">{contest.description}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/concursos/${slug}/questoes`}>Resolver questões (todas as matérias)</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/minha-chance">
            <TrendingUp />
            Ver minha chance
          </Link>
        </Button>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <Scale className="size-5" />
          Matérias e peso no edital
        </h2>
        <div className="flex flex-col gap-3">
          {contest.subjects.map((cs) => {
            const progress = progressBySubject.get(cs.subjectId);
            const accuracy =
              progress && progress.totalAnswered > 0
                ? Math.round((progress.totalCorrect / progress.totalAnswered) * 100)
                : null;

            return (
              <Card key={cs.id}>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base font-medium">
                      {cs.subject.name}
                    </CardTitle>
                    <Badge variant="outline">{cs.weight}% do edital</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Progress value={cs.weight} />
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {accuracy !== null
                        ? `${accuracy}% de acerto · ${progress?.totalAnswered} respondidas`
                        : "Você ainda não respondeu questões desta matéria"}
                    </span>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/concursos/${slug}/questoes?materia=${cs.subject.slug}`}>
                        Resolver
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
