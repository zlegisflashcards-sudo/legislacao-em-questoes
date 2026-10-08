import { expectedQuestionOrder } from "@/lib/question-structure-consistency";

export type LawQuestionArticleGap = {
  article: number;
  ordem: string;
  assunto: string;
  identityKey: string;
};

/**
 * A ausência é editorialmente uma candidata, não uma afirmação de que o
 * artigo existe: leis podem pular números, ter artigos revogados ou letras.
 */
export function findLawQuestionArticleGaps(rows: Array<{ ordem: string | null | undefined }>): LawQuestionArticleGap[] {
  const covered = new Set<number>();
  for (const row of rows) {
    const firstPart = row.ordem?.trim().split(".")[0] ?? "";
    if (!/^\d+$/.test(firstPart)) continue;
    const article = Number(firstPart);
    if (Number.isSafeInteger(article) && article > 0) covered.add(article);
  }
  if (covered.size < 2) return [];
  const first = Math.min(...covered);
  const last = Math.max(...covered);
  const gaps: LawQuestionArticleGap[] = [];
  for (let article = first + 1; article < last; article += 1) {
    if (covered.has(article)) continue;
    const ordem = expectedQuestionOrder({ artigo: String(article) });
    if (!ordem) continue;
    gaps.push({ article, ordem, assunto: `Art. ${article}º`, identityKey: `automatic-gap:${ordem}` });
  }
  return gaps;
}
