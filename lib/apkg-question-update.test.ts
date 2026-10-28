import { describe, expect, it } from "vitest";
import { classifyApkgQuestion, findApkgExistingQuestion, hasMixedApkgBatch, isApkgQuestionChanged, type ApkgExistingQuestion, type ApkgStoredQuestion } from "@/lib/apkg-question-update";
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

describe("findApkgExistingQuestion", () => {
  const existing: ApkgExistingQuestion = { ...stored, id: "2efd13d4-34d1-40e0-be29-6b7a66c4f83a" };

  it("usa IDQuestao como identidade mesmo quando Ordem mudou", () => {
    const incoming = row({ id_questao: existing.id, ordem: "0001.0.01.0.01.0" });
    expect(findApkgExistingQuestion(incoming, [], new Map([[existing.id, existing]]))).toBe(existing);
  });

  it("não cai para slug/Ordem quando um UUID foi informado", () => {
    const incoming = row({ id_questao: "11111111-2222-4333-8444-555555555555", ordem: "0001.0.01.0.01.0" });
    expect(findApkgExistingQuestion(incoming, [existing], new Map())).toBeUndefined();
  });

  it("mantém o fallback histórico somente para arquivo sem IDQuestao", () => {
    expect(findApkgExistingQuestion(row(), [existing], new Map())).toBe(existing);
  });

  it("reproduz localmente Ordem alterada com UUID e lote misto", () => {
    const changedOrder = row({ id_questao: existing.id, ordem: "0001.0.01.0.01.0" });
    const update = classifyApkgQuestion(changedOrder, [], new Map([[existing.id, existing]]), null);
    const newQuestion = classifyApkgQuestion(row({ line: 2, id_questao: undefined, pergunta: "Nova questão da fixture" }), [], new Map(), null);
    expect(update.matching?.id).toBe(existing.id);
    expect(update.status).toBe("atualizada");
    expect(newQuestion.status).toBe("nova");
    expect(hasMixedApkgBatch([update.status, newQuestion.status])).toBe(true);
  });
});
