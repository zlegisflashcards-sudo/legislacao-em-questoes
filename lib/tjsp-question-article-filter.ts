import { questionsInScope, type ScopedQuestion } from "./law-question-scope-resolution";

type Interval = readonly [first: number, last: number];
type ArticleRule = {
  lawId: number;
  intervals: readonly Interval[];
  lettered?: readonly string[];
};

// Edital TJSP 02/2026 (Anexo VIII, p. 155). Only these four draft scope IDs
// get article boundaries; they do not change the official structure tree.
const rules = new Map<string, ArticleRule>([
  ["3e03d11b-cf6e-43f3-9d35-760fd3034d9b", {
    lawId: 58, intervals: [[293,305],[307,308],[312,317],[319,333],[336,337],[339,347],[357,357],[359,359]], lettered: ["311-a"],
  }],
  ["7986ba0a-6707-46cd-9475-9ad5f52e3593", {
    lawId: 61, intervals: [[251,258],[261,267],[274,274],[351,372],[394,497],[531,538],[541,548],[574,667]],
  }],
  ["69639148-cc8b-4de1-ba87-53fe18a0a8b1", {
    lawId: 14, intervals: [[5,13],[37,41],[92,92]],
  }],
  ["01fd3157-dcc6-4c4a-92ca-e8af4b549c40", {
    lawId: 27, intervals: [[3,19],[60,83],[88,89]],
  }],
]);

export function questionArticleIsInTjspScope(leiId: number, recorteId: string | null, ordem?: string | null): boolean {
  const rule = recorteId ? rules.get(recorteId) : undefined;
  if (!rule) return true;
  if (rule.lawId !== leiId || !ordem) return false;
  // Canonical Ordem: article, article suffix, paragraph, paragraph suffix,
  // inciso, alínea. Do not guess from free-text assunto or artigo.
  const match = /^(\d{1,6})\.(0|[a-z]{1,3})\.\d{2}\.(?:0|[a-z]+)\.\d{2}\.(?:0|[a-z]+)$/i.exec(ordem.trim());
  if (!match) return false;
  const article = Number(match[1]);
  const suffix = match[2].toLowerCase();
  if (suffix !== "0" && rule.lettered?.includes(`${article}-${suffix}`)) return true;
  // In "A a B", A-A and other inserted articles before B are between the
  // endpoints; B-A comes after B. A single numbered article is exact.
  return rule.intervals.some(([first, last]) => article >= first && (article < last || (article === last && suffix === "0")));
}

export function studyQuestionsInScope<T extends ScopedQuestion & { ordem?: string | null }>(
  questions: T[],
  structureIds: number[] | null,
  leiId: number,
  recorteId: string | null,
): T[] {
  const scoped = questionsInScope(questions, structureIds);
  return recorteId && rules.has(recorteId)
    ? scoped.filter((question) => questionArticleIsInTjspScope(leiId, recorteId, question.ordem))
    : scoped;
}
