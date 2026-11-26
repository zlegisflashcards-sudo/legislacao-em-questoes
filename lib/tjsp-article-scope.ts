import { parseQuestionOrder } from "@/lib/question-structure-consistency";

type Range = readonly [first: number, last: number];
type ArticleRule = { lawId: number; ranges: readonly Range[]; exact: readonly string[] };

/** Edital TJSP 02/2026, Anexo VIII. A regra refina os recortes indicados,
 * nunca substitui a seleção da hierarquia oficial. Não afeta a lei integral. */
const rules = new Map<string, ArticleRule>([
  ["3e03d11b-cf6e-43f3-9d35-760fd3034d9b", { lawId: 58, ranges: [[293, 305], [312, 317], [319, 333], [339, 347]], exact: ["307", "308", "311-A", "336", "337", "357", "359"] }],
  ["7986ba0a-6707-46cd-9475-9ad5f52e3593", { lawId: 61, ranges: [[251, 258], [261, 267], [351, 372], [394, 497], [531, 538], [541, 548], [574, 667]], exact: ["274"] }],
  ["69639148-cc8b-4de1-ba87-53fe18a0a8b1", { lawId: 14, ranges: [[5, 13], [37, 41]], exact: ["92"] }],
  ["01fd3157-dcc6-4c4a-92ca-e8af4b549c40", { lawId: 27, ranges: [[3, 19], [60, 83]], exact: ["88", "89"] }],
  ["1501b10b-b23f-445f-81c2-c9a2f33e401a", { lawId: 208, ranges: [[1, 86], [171, 175], [239, 323]], exact: [] }],
]);
export function tjspArticleRule(scopeId: string | null | undefined) { return scopeId ? rules.get(scopeId.toLowerCase()) : undefined; }

const articleToken = String.raw`\d{1,4}(?:\s*[º°])?(?:\s*[-–‑]\s*[a-z](?![a-z]))?`;
const group = new RegExp(String.raw`\b(?:arts?\.?|artigos?)\s*(${articleToken}(?:\s*(?:,|e|ou|a|até|[-–])\s*(?:arts?\.?\s*)?${articleToken})*)`, "giu");
const token = new RegExp(String.raw`(\d{1,4})(?:\s*[º°])?(?:\s*[-–‑]\s*([a-z])(?![a-z]))?`, "giu");
function articleKeys(subject: string) {
  const result: string[] = [];
  for (const match of subject.matchAll(group)) {
    const matches = [...match[1].matchAll(token)];
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const number = Number(current[1]);
      const suffix = current[2]?.toUpperCase();
      const next = matches[i + 1];
      const separator = next ? match[1].slice(current.index + current[0].length, next.index).trim() : "";
      if (next && /^(?:a|até|[-–])$/i.test(separator)) {
        const last = Number(next[1]);
        if (suffix || next[2] || last < number) return [];
        for (let art = number; art <= last; art++) result.push(String(art));
        i++;
      } else result.push(suffix ? `${number}-${suffix}` : String(number));
    }
  }
  return result;
}

export function articleAllowed(rule: ArticleRule, key: string) {
  return rule.exact.includes(key) || rule.ranges.some(([first, last]) => {
    const number = Number(key.split("-")[0]);
    // Um sufixo dentro de intervalo é incluído; após o artigo final já é outro dispositivo.
    return number >= first && (number < last || number === last && !key.includes("-"));
  });
}

export function questionMatchesArticleRule(rule: ArticleRule, question: { lei_id?: number; ordem?: string | null; assunto?: string | null }) {
  if (question.lei_id !== rule.lawId) return false;
  const parsed = parseQuestionOrder(question.ordem);
  if (!parsed?.artigo || !question.assunto) return false;
  const key = parsed.letraArtigo ? `${parsed.artigo}-${parsed.letraArtigo}` : parsed.artigo;
  const refs = articleKeys(question.assunto);
  return refs.includes(key) && refs.every((ref) => articleAllowed(rule, ref));
}
