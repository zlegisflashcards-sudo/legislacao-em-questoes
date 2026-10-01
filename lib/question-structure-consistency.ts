export type StructuralIssue = { code: string; label: string; certainty: "objective" | "possible" };

type SubjectStructure = { article?: string; suffix?: string; paragraph?: string; unique?: boolean; item?: string; letter?: string };

const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function parseQuestionSubject(value: string | null | undefined): SubjectStructure | null {
  if (!value?.trim()) return null;
  const text = clean(value);
  const article = text.match(/art\.?\s*(\d+)(?:\s*-\s*([a-z]))?/i);
  if (!article) return null;
  const paragraph = text.match(/(?:§\s*(\d+)\s*(?:o|º)?|paragrafo\s+(unico|\d+))/i);
  const roman = text.match(/(?:§[^,]*,|paragrafo[^,]*,)\s*([ivxlcdm]+)\b/i);
  const letter = text.match(/[,\s]["“]?([a-z])["”]?\s*$/i);
  return { article: article[1], suffix: article[2]?.toUpperCase(), paragraph: paragraph?.[1] ?? (paragraph?.[2] === "unico" ? undefined : paragraph?.[2]), unique: /paragrafo\s+unico|§\s*unico/i.test(text), item: roman?.[1]?.toUpperCase(), letter: letter && roman ? letter[1].toLowerCase() : undefined };
}

function orderParts(value: string | null | undefined) { return value?.trim().split(".") ?? []; }
function normalizedNumber(value: string | undefined) { return value ? String(Number(value)) : undefined; }

export function questionStructureIssues(question: { assunto?: string | null; ordem?: string | null; legislacao?: string | null; slug?: string | null }, context?: { slug: string; ordem: string }): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  if (!question.assunto?.trim()) issues.push({ code: "assunto_ausente", label: "Assunto ausente", certainty: "objective" });
  if (!question.ordem?.trim()) issues.push({ code: "ordem_ausente", label: "Ordem ausente", certainty: "objective" });
  if (!question.legislacao?.trim()) issues.push({ code: "legislacao_ausente", label: "Legislação ausente", certainty: "objective" });
  if (context && question.slug && question.slug.toLowerCase() !== context.slug.toLowerCase()) issues.push({ code: "lei_contexto", label: "Lei diferente do contexto", certainty: "objective" });
  const subject = parseQuestionSubject(question.assunto);
  const parts = orderParts(question.ordem);
  if (!subject || !parts.length) return issues;
  const articlePart = normalizedNumber(parts[0]);
  if (articlePart && normalizedNumber(subject.article) !== articlePart) issues.push({ code: "artigo_divergente", label: "Artigo incompatível com a ordem", certainty: "objective" });
  if (subject.suffix && !question.ordem?.toUpperCase().includes(subject.suffix)) issues.push({ code: "artigo_letra", label: "Artigo com letra possivelmente não representado", certainty: "possible" });
  const nonZero = parts.slice(1).filter((part) => Number(part.replace(/\D/g, "")) > 0);
  if ((subject.paragraph || subject.unique) && !nonZero.length) issues.push({ code: "paragrafo_caput", label: "Assunto indica parágrafo, ordem está no caput", certainty: "objective" });
  if (subject.item && nonZero.length < 2) issues.push({ code: "inciso_incompleto", label: "Assunto indica inciso, ordem não chega ao inciso", certainty: "objective" });
  if (subject.letter && nonZero.length < 3) issues.push({ code: "alinea_incompleta", label: "Assunto indica alínea, ordem não chega à alínea", certainty: "objective" });
  return issues;
}

export function legislationGroups<T extends { legislacao?: string | null }>(questions: T[]) {
  const groups = new Map<string, number>();
  for (const question of questions) { const value = (question.legislacao ?? "").trim(); groups.set(value, (groups.get(value) ?? 0) + 1); }
  return [...groups.entries()].map(([value, count]) => ({ value, count }));
}
