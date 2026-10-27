import { z } from "zod";

/** Entrada de `answerQuestion`: ids vazios nunca chegam ao banco. */
export const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
});

/** E-mail do link mágico: valida antes de gastar um envio de SMTP. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
