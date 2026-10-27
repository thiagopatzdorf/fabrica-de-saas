import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getQuestionsForSolving } from "@/lib/queries";
import { QuestionRunner } from "@/components/questions/question-runner";
import { Button } from "@/components/ui/button";

export default async function QuestoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ materia?: string }>;
}) {
  const { slug } = await params;
  const { materia } = await searchParams;

  const session = await auth();
  if (!session?.user) {
    redirect(`/login`);
  }

  const contest = await prisma.contest.findUnique({ where: { slug } });
  if (!contest) notFound();

  let subjectId: string | undefined;
  let subjectName: string | undefined;
  if (materia) {
    const subject = await prisma.subject.findUnique({ where: { slug: materia } });
    if (!subject) notFound();
    subjectId = subject.id;
    subjectName = subject.name;
  }

  const questions = await getQuestionsForSolving({ contestId: contest.id, subjectId });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={`/concursos/${slug}`}>
          <ArrowLeft />
          Voltar para {contest.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-xl font-bold">{contest.name}</h1>
        <p className="text-muted-foreground text-sm">
          {subjectName ? `Matéria: ${subjectName}` : "Todas as matérias"} ·{" "}
          {questions.length} questões
        </p>
      </div>

      <QuestionRunner questions={questions} />
    </div>
  );
}
