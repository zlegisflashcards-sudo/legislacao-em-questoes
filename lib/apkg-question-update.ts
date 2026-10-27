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
