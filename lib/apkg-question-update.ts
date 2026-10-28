import type { ImportedQuestion } from "@/lib/imported-question";

/** Fields transported by an APKG that are protected by the update snapshot. */
export type ApkgStoredQuestion = {
  pergunta: string;
  resposta: string;
  justificativa: string | null;
  titulo: string | null;
  assunto: string | null;
  legislacao: string | null;
  ordem: string;
  total_artigos: number | null;
  ultima_alteracao_legislativa: string | null;
};

/** A stored question as addressed by the immutable IDQuestao in an APKG. */
export type ApkgExistingQuestion = ApkgStoredQuestion & { id: string };

/**
 * IDQuestao is authoritative whenever it is present.  In particular, an
 * APKG may legitimately change `ordem`, so looking it up through the
 * slug/ordem index would silently turn the update into a new question.
 * Files without an IDQuestao retain the historical source/prompt fallback.
 */
export function findApkgExistingQuestion(
  row: Pick<ImportedQuestion, "id_questao" | "pergunta">,
  atSource: readonly ApkgExistingQuestion[],
  byId: ReadonlyMap<string, ApkgExistingQuestion>,
): ApkgExistingQuestion | undefined {
  if (row.id_questao) return byId.get(row.id_questao);
  return atSource.find((item) => item.pergunta.trim() === row.pergunta.trim());
}

export type ApkgPreviewStatus = "nova" | "atualizada" | "duplicada" | "erro";

/** Classification shared by the preview and its local regression fixtures. */
export function classifyApkgQuestion(
  row: ImportedQuestion,
  atSource: readonly ApkgExistingQuestion[],
  byId: ReadonlyMap<string, ApkgExistingQuestion>,
  reason: string | null,
) {
  const matching = findApkgExistingQuestion(row, atSource, byId);
  const status: ApkgPreviewStatus = reason ? "erro" : matching ? isApkgQuestionChanged(matching, row) ? "atualizada" : "duplicada" : "nova";
  return { matching, status };
}

export function hasMixedApkgBatch(statuses: Iterable<ApkgPreviewStatus>) {
  let hasNew = false;
  let hasUpdate = false;
  for (const status of statuses) {
    if (status === "nova") hasNew = true;
    if (status === "atualizada") hasUpdate = true;
  }
  return hasNew && hasUpdate;
}

export function apkgQuestionProposal(row: ImportedQuestion): ApkgStoredQuestion {
  return {
    pergunta: row.pergunta,
    resposta: row.resposta,
    justificativa: row.justificativa || null,
    titulo: row.titulo || null,
    assunto: row.assunto || null,
    legislacao: row.legislacao || null,
    ordem: row.ordem,
    total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null,
    ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null,
  };
}

/** True only when at least one importable APKG field differs from the snapshot. */
export function isApkgQuestionChanged(stored: ApkgStoredQuestion, row: ImportedQuestion): boolean {
  const proposed = apkgQuestionProposal(row);
  return Object.entries(proposed).some(([field, value]) => stored[field as keyof ApkgStoredQuestion] !== value);
}
