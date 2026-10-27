import { describe, expect, it } from "vitest";
import { isApkgQuestionChanged, type ApkgStoredQuestion } from "@/lib/apkg-question-update";
import type { ImportedQuestion } from "@/lib/imported-question";

const stored: ApkgStoredQuestion = {
  pergunta: "Enunciado original", resposta: "Certo", justificativa: "Justificativa original",
  titulo: "Título", assunto: "Assunto", legislacao: "Art. 1º", ordem: "0001.0.00.00",
  total_artigos: 10, ultima_alteracao_legislativa: "Atualização",
};
const row = (patch: Partial<ImportedQuestion> = {}): ImportedQuestion => ({
  line: 1, deck: ["Capítulo I"], pergunta: stored.pergunta, resposta: "Certo",
  justificativa: stored.justificativa ?? "", titulo: stored.titulo ?? "", assunto: stored.assunto ?? "",
  legislacao: stored.legislacao ?? "", ordem: stored.ordem, total_artigos: String(stored.total_artigos),
  slug: "lei-e2e", ultima_alteracao_legislativa: stored.ultima_alteracao_legislativa ?? "", ...patch,
});

describe("isApkgQuestionChanged", () => {
  it.each([
    ["pergunta", { pergunta: "Enunciado alterado" }],
    ["gabarito", { resposta: "Errado" }],
    ["justificativa", { justificativa: "Justificativa alterada" }],
    ["ordem", { ordem: "0002.0.00.00" }],
    ["legislação", { legislacao: "Art. 2º" }],
  ] as const)("classifica alteração isolada de %s como atualização", (_field, patch) => {
    expect(isApkgQuestionChanged(stored, row(patch))).toBe(true);
  });

  it("classifica todos os campos iguais como duplicada/idempotente", () => {
    expect(isApkgQuestionChanged(stored, row())).toBe(false);
  });
});
