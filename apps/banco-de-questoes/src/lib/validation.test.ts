import { describe, expect, it } from "vitest";

import { answerSchema, emailSchema } from "./validation";

describe("answerSchema", () => {
  it("aceita ids preenchidos", () => {
    expect(answerSchema.safeParse({ questionId: "q1", selectedOptionId: "o1" }).success).toBe(true);
  });

  it("recusa id de questão vazio, que viraria consulta sem alvo", () => {
    expect(answerSchema.safeParse({ questionId: "", selectedOptionId: "o1" }).success).toBe(false);
  });

  it("recusa resposta sem alternativa escolhida", () => {
    expect(answerSchema.safeParse({ questionId: "q1" }).success).toBe(false);
  });

  it("recusa ids que não são texto (injeção de objeto no corpo da action)", () => {
    expect(
      answerSchema.safeParse({ questionId: { not: "a-string" }, selectedOptionId: "o1" }).success
    ).toBe(false);
  });
});

describe("emailSchema", () => {
  it("normaliza espaços e maiúsculas para não criar duas contas do mesmo e-mail", () => {
    expect(emailSchema.parse("  Ana@Exemplo.COM ")).toBe("ana@exemplo.com");
  });

  it("recusa texto sem arroba", () => {
    expect(emailSchema.safeParse("ana.exemplo.com").success).toBe(false);
  });

  it("recusa valor ausente (campo não enviado no formulário)", () => {
    expect(emailSchema.safeParse(null).success).toBe(false);
  });

  it("recusa string vazia", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
  });
});
