export type QuestionSubjectEditorialWarning = {
  field: "assunto";
  reason: "URL e marcador Fonte: no Assunto" | "URL no Assunto" | 'Marcador "Fonte:" no Assunto';
  snippet: string;
};

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/i;
const SOURCE_PATTERN = /\bfonte\s*:/i;

function snippetAround(value: string, start: number, length: number) {
  const limit = 180;
  const from = Math.max(0, start - 28);
  const to = Math.min(value.length, Math.max(start + length, from + limit));
  return `${from ? "…" : ""}${value.slice(from, to).trim()}${to < value.length ? "…" : ""}`;
}

/**
 * Detecta somente evidências objetivas de fonte bibliográfica vazando para a
 * referência curta. Referências legais e tratados sem URL ou marcador não são
 * inferidos como erro editorial.
 */
export function findQuestionSubjectEditorialWarnings(subject: string | null | undefined): QuestionSubjectEditorialWarning[] {
  const value = subject?.trim() ?? "";
  if (!value) return [];
  const url = value.match(URL_PATTERN);
  const source = value.match(SOURCE_PATTERN);
  if (!url && !source) return [];
  const reason = url && source
    ? "URL e marcador Fonte: no Assunto"
    : url
      ? "URL no Assunto"
      : 'Marcador "Fonte:" no Assunto';
  const match = url ?? source!;
  return [{ field: "assunto", reason, snippet: snippetAround(value, match.index ?? 0, match[0].length) }];
}
