"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { answerQuestion, type AnswerResult } from "@/app/concursos/[slug]/questoes/actions";

type QuestionOption = { id: string; label: string; text: string };
type QuestionForRunner = {
  id: string;
  statement: string;
  subject: { name: string };
  options: QuestionOption[];
};

export function QuestionRunner({ questions }: { questions: QuestionForRunner[] }) {
  const [index, setIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const question = questions[index];
  const isLastQuestion = index === questions.length - 1;

  if (!question) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center">
          Nenhuma questão encontrada para este filtro.
        </CardContent>
      </Card>
    );
  }

  function handleSubmit() {
    if (!selectedOptionId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await answerQuestion({
          questionId: question.id,
          selectedOptionId,
        });
        setResult(res);
        setScore((s) => ({
          correct: s.correct + (res.isCorrect ? 1 : 0),
          answered: s.answered + 1,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao enviar resposta.");
      }
    });
  }

  function handleNext() {
    setIndex((i) => i + 1);
    setSelectedOptionId(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Questão {index + 1} de {questions.length}
        </span>
        <Badge variant="secondary">
          {score.correct}/{score.answered} acertos nesta sessão
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit">
            {question.subject.name}
          </Badge>
          <CardTitle className="text-base leading-relaxed font-normal">
            {question.statement}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedOptionId ?? undefined}
            onValueChange={setSelectedOptionId}
            disabled={!!result}
          >
            {question.options.map((option) => {
              const isSelected = option.id === selectedOptionId;
              const isCorrectOption = result && option.id === result.correctOptionId;
              const isWrongSelected = result && isSelected && !result.isCorrect;

              return (
                <div
                  key={option.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    isCorrectOption && "border-success bg-success/10",
                    isWrongSelected && "border-destructive bg-destructive/10"
                  )}
                >
                  <RadioGroupItem value={option.id} id={option.id} className="mt-0.5" />
                  <Label htmlFor={option.id} className="flex-1 font-normal">
                    <span className="text-muted-foreground mr-2 font-medium">
                      {option.label})
                    </span>
                    {option.text}
                  </Label>
                  {isCorrectOption ? (
                    <CheckCircle2 className="text-success size-5 shrink-0" />
                  ) : null}
                  {isWrongSelected ? (
                    <XCircle className="text-destructive size-5 shrink-0" />
                  ) : null}
                </div>
              );
            })}
          </RadioGroup>

          {error ? <p className="text-destructive mt-3 text-sm">{error}</p> : null}

          {result ? (
            <Alert variant={result.isCorrect ? "success" : "destructive"} className="mt-4">
              <AlertTitle>{result.isCorrect ? "Você acertou!" : "Você errou."}</AlertTitle>
              {result.explanation ? (
                <AlertDescription>{result.explanation}</AlertDescription>
              ) : null}
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {!result ? (
            <Button onClick={handleSubmit} disabled={!selectedOptionId || isPending}>
              {isPending ? "Enviando..." : "Responder"}
            </Button>
          ) : isLastQuestion ? (
            <Button asChild>
              <Link href="/progresso">Ver meu progresso</Link>
            </Button>
          ) : (
            <Button onClick={handleNext}>Próxima questão</Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
