import { questionsInScope, type ScopedQuestion } from "./law-question-scope-resolution";

type Article = { number: number; suffix: string };
type Range = readonly [Article, Article];
type Parsed = { ok: true; value: string; ranges: Range[] } | { ok: false; error: string };

const initial = new Map([
  ["3e03d11b-cf6e-43f3-9d35-760fd3034d9b", { lei: 58, filter: "293-305, 307-308, 311-A, 312-317, 319-333, 336-337, 339-347, 357, 359" }],
  ["7986ba0a-6707-46cd-9475-9ad5f52e3593", { lei: 61, filter: "251-258, 261-267, 274, 351-372, 394-497, 531-538, 541-548, 574-667" }],
  ["69639148-cc8b-4de1-ba87-53fe18a0a8b1", { lei: 14, filter: "5-13, 37-41, 92" }],
  ["01fd3157-dcc6-4c4a-92ca-e8af4b549c40", { lei: 27, filter: "3-19, 60-83, 88-89" }],
]);
export function effectiveArticleFilter(leiId: number, recorteId: string | null, stored?: string | null) {
  const seed = recorteId ? initial.get(recorteId) : undefined;
  return stored ?? (seed?.lei === leiId ? seed.filter : "");
}

const compare = (a: Article, b: Article) => a.number - b.number || (a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0);
const label = (a: Article) => String(a.number) + (a.suffix ? "-" + a.suffix.toUpperCase() : "");
const inputArticle = "(\\d{1,6})(?:\\s*-\\s*([A-Za-z]{1,3}))?";
const token = new RegExp(`^${inputArticle}(?:\\s*(?:-|a)\\s*${inputArticle})?$`, "i");

export function parseScopeArticleFilter(input: string): Parsed {
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: "", ranges: [] };
  if (trimmed.length > 500) return { ok: false, error: "Use no máximo 500 caracteres no filtro de artigos." };
  const ranges: Range[] = [];
  for (const part of trimmed.split(/[,;\n]/u)) {
    const match = token.exec(part.trim().replace(/[–—]/g, "-").replace(/[º°]/g, ""));
    if (!match) return { ok: false, error: `Artigo ou faixa inválida: “${part.trim() || "vazia"}”. Exemplo: 261-267, 274, 311-A.` };
    const low = { number: Number(match[1]), suffix: match[2]?.toLowerCase() ?? "" };
    const high = match[3] ? { number: Number(match[3]), suffix: match[4]?.toLowerCase() ?? "" } : low;
    if (low.number < 1 || compare(low, high) > 0) return { ok: false, error: `Faixa invertida ou inválida: “${part.trim()}”.` };
    ranges.push([low, high]);
  }
  const value = [...new Set(ranges.map(([a,b]) => compare(a,b) ? label(a) + "-" + label(b) : label(a)))].join(", ");
  if (value.length > 500) return { ok: false, error: "Use no máximo 500 caracteres no filtro de artigos." };
  return { ok: true, value, ranges };
}

function hasArticle(ordem: string | null | undefined, ranges: Range[]) {
  if (!ranges.length) return true;
  const match = /^(\d{1,6})\.(0|[a-z]{1,3})\.\d{2}\.(?:0|[a-z]+)\.\d{2}\.(?:0|[a-z]+)$/i.exec(ordem?.trim() ?? "");
  if (!match) return false;
  const article = { number: Number(match[1]), suffix: match[2] === "0" ? "" : match[2].toLowerCase() };
  return ranges.some(([first,last]) => compare(first,article) <= 0 && compare(article,last) <= 0);
}

export function questionArticleIsInTjspScope(leiId: number, recorteId: string | null, ordem?: string | null): boolean {
  const seed = recorteId ? initial.get(recorteId) : undefined;
  if (seed && seed.lei !== leiId) return false;
  const parsed = parseScopeArticleFilter(effectiveArticleFilter(leiId, recorteId));
  return parsed.ok && hasArticle(ordem, parsed.ranges);
}

export function studyQuestionsInScope<T extends ScopedQuestion & { ordem?: string | null }>(
  questions: T[],
  structureIds: number[] | null,
  leiId: number,
  recorteId: string | null,
  stored?: string | null,
): T[] {
  const scoped = questionsInScope(questions, structureIds);
  const seed = recorteId ? initial.get(recorteId) : undefined;
  if (seed && seed.lei !== leiId) return [];
  const parsed = parseScopeArticleFilter(effectiveArticleFilter(leiId, recorteId, stored));
  return parsed.ok ? scoped.filter((q) => hasArticle(q.ordem, parsed.ranges)) : [];
}
