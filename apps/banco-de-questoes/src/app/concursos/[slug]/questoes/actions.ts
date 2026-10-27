"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { answerSchema } from "@/lib/validation";

export type AnswerResult = {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
};

export async function answerQuestion(input: {
  questionId: string;
  selectedOptionId: string;
}): Promise<AnswerResult> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Você precisa estar logado para responder questões.");
  }

  const { questionId, selectedOptionId } = answerSchema.parse(input);

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: true },
  });
  if (!question) throw new Error("Questão não encontrada.");

  const selectedOption = question.options.find((o) => o.id === selectedOptionId);
  if (!selectedOption) throw new Error("Alternativa inválida para esta questão.");

  const correctOption = question.options.find((o) => o.isCorrect);
  if (!correctOption) throw new Error("Questão sem gabarito cadastrado.");

  const isCorrect = selectedOption.isCorrect;
  const userId = session.user.id;

  await prisma.$transaction([
    prisma.userAnswer.create({
      data: {
        userId,
        questionId,
        selectedOptionId,
        isCorrect,
      },
    }),
    prisma.userProgress.upsert({
      where: {
        userId_contestId_subjectId: {
          userId,
          contestId: question.contestId,
          subjectId: question.subjectId,
        },
      },
      create: {
        userId,
        contestId: question.contestId,
        subjectId: question.subjectId,
        totalAnswered: 1,
        totalCorrect: isCorrect ? 1 : 0,
      },
      update: {
        totalAnswered: { increment: 1 },
        totalCorrect: { increment: isCorrect ? 1 : 0 },
      },
    }),
  ]);

  return {
    isCorrect,
    correctOptionId: correctOption.id,
    explanation: question.explanation ?? "",
  };
}
