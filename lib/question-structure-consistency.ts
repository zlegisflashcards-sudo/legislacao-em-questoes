export type StructuralIssue = { code: string; label: string; certainty: "objective" | "possible" };
export type StructuralStatus = "valid" | "conflict" | "possible_conflict";
export type DeviceReference = { artigo?: string; letraArtigo?: string; paragrafo?: string; letraParagrafo?: string; inciso?: string; letraInciso?: string };
export type StructuralValidation = { status: StructuralStatus; currentOrder: string; expectedOrder?: string; subjectReference?: DeviceReference; orderReference?: DeviceReference; differences?: string[]; message?: string };

type SubjectStructure = { article?: string; suffix?: string; paragraph?: string; paragraphSuffix?: string; unique?: boolean; item?: string; itemSuffix?: string; letter?: string };
const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
type LawReferenceMatch = { text: string; key: string };

function lawReferenceMatch(value: string | null | undefined): LawReferenceMatch | null {
  const match = value?.match(/\blei(?:\s+estadual)?\s*(?:n\s*[º°o.]?\s*)?(\d{1,3}(?:\.\d{3})*|\d+)\s*\/\s*(\d{2,4})(?:\s*[-,]\s*[a-z]{2})?/i);
  if (!match) return null;
  return { text: match[0], key: `${match[1].replace(/\./g, "")}/${match[2]}` };
}

/**
 * Sugere a forma cadastrada do nome curto apenas quando a referência numérica
 * já é a mesma. Nunca corrige uma lei realmente diferente de forma automática.
 */
export function canonicalizeQuestionLawReference(subject: string | null | undefined, lawShortName: string | null | undefined) {
  const before = subject?.trim();
  const expected = lawShortName?.trim();
  if (!before || !expected) return null;
  const currentReference = lawReferenceMatch(before);
  const expectedReference = lawReferenceMatch(expected);
  if (!currentReference || !expectedReference || currentReference.key !== expectedReference.key) return null;
  const after = before.replace(currentReference.text, expected);
  return after === before ? null : after;
}
const romanValues: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToNumber(value: string) { let result = 0; const letters = value.toUpperCase().split(""); for (let index = 0; index < letters.length; index += 1) { const current = romanValues[letters[index]]; const next = romanValues[letters[index + 1]] ?? 0; if (!current) return null; result += current < next ? -current : current; } return result || null; }
function normalizedNumber(value: string | undefined) { return value && /^\d+$/.test(value) ? String(Number(value)) : undefined; }
function normalizedLetter(value: string | undefined) { return value && /^[a-z]$/i.test(value) ? value.toUpperCase() : undefined; }
function referenceFromSubject(value: SubjectStructure): DeviceReference { return { artigo: normalizedNumber(value.article), letraArtigo: normalizedLetter(value.suffix), paragrafo: normalizedNumber(value.paragraph), letraParagrafo: normalizedLetter(value.paragraphSuffix), inciso: value.item ? String(romanToNumber(value.item) ?? "") || undefined : undefined, letraInciso: normalizedLetter(value.itemSuffix ?? value.letter) }; }

/** Parses the legal subject without treating an alínea as a new order level. */
export function parseQuestionSubject(value: string | null | undefined): SubjectStructure | null {
  if (!value?.trim()) return null;
  const text = clean(value);
  const article = text.match(/art\.?\s*(\d+)\s*(?:º|o)?(?:\s*-\s*([a-z]))?/i);
  if (!article) return null;
  const sectionParagraph = text.match(/§\s*(unico|\d+)\s*(?:º|o)?(?:\s*-\s*([a-z]))?/i);
  const namedParagraph = text.match(/paragrafo\s+(unico|\d+)\s*(?:º|o)?(?:\s*-\s*([a-z]))?/i);
  const rawParagraph = sectionParagraph?.[1] ?? namedParagraph?.[1];
  const paragraphNumber = rawParagraph === "unico" ? "1" : rawParagraph;
  const paragraphSuffix = sectionParagraph?.[2] ?? namedParagraph?.[2];
  const item = text.match(/(?:inciso\s+|art\.?\s*\d+\s*(?:º|o)?(?:\s*-\s*[a-z])?\s*,\s*|§[^,]*,\s*|paragrafo[^,]*,\s*)([ivxlcdm]+)(?:\s*-\s*([a-z]))?\b/i);
  const letter = text.match(/[,:\s]["“]?([a-z])["”]?\s*$/i);
  return { article: article[1], suffix: article[2]?.toUpperCase(), paragraph: paragraphNumber, paragraphSuffix: paragraphSuffix?.toUpperCase(), unique: rawParagraph === "unico", item: item?.[1]?.toUpperCase(), itemSuffix: item?.[2]?.toUpperCase(), letter: letter && !item?.[2] ? letter[1].toLowerCase() : undefined };
}

/** Canonical order: artigo.letra_artigo.paragrafo.letra_paragrafo.inciso.letra_inciso. */
export function parseQuestionOrder(value: string | null | undefined): DeviceReference | null {
  const parts = value?.trim().split(".") ?? [];
  if (parts.length !== 6 || !/^\d+$/.test(parts[0]) || !/^(0|[a-z])$/i.test(parts[1]) || !/^\d+$/.test(parts[2]) || !/^(0|[a-z])$/i.test(parts[3]) || !/^\d+$/.test(parts[4]) || !/^(0|[a-z])$/i.test(parts[5])) return null;
  return { artigo: normalizedNumber(parts[0]), letraArtigo: parts[1] === "0" ? undefined : normalizedLetter(parts[1]), paragrafo: Number(parts[2]) ? normalizedNumber(parts[2]) : undefined, letraParagrafo: parts[3] === "0" ? undefined : normalizedLetter(parts[3]), inciso: Number(parts[4]) ? normalizedNumber(parts[4]) : undefined, letraInciso: parts[5] === "0" ? undefined : normalizedLetter(parts[5]) };
}

export function expectedQuestionOrder(reference: DeviceReference) { if (!reference.artigo || !/^\d+$/.test(reference.artigo)) return undefined; return [reference.artigo.padStart(4, "0"), reference.letraArtigo?.toLowerCase() ?? "0", (reference.paragrafo ?? "0").padStart(2, "0"), reference.letraParagrafo?.toLowerCase() ?? "0", (reference.inciso ?? "0").padStart(2, "0"), reference.letraInciso?.toLowerCase() ?? "0"].join("."); }

type TreatySubject = { kind: "rule" | "article-item" | "namespace"; unit?: string; units?: string[]; item?: string; composite?: boolean; namespace?: string };
/** Preserves treaty wording; Ordem remains only the existing internal association key. */
export function parseTreatyQuestionSubject(value: string | null | undefined): TreatySubject | null {
  const text = clean(value ?? "");
  if (!text.trim()) return null;
  const namespace = text.match(/^\s*(anexo|apendice|observacao(?:es)?\s+preliminares?)\b/i);
  if (namespace) return { kind: "namespace", namespace: namespace[1] };
  const rules = text.match(/\bregras?\s+(\d{1,3}(?:\s*(?:,|e|ou)\s*\d{1,3})*)/i)?.[1].match(/\d{1,3}/g) ?? [];
  if (rules.length) {
    const item = text.match(/\bregra\s+\d{1,3}\s*[.,]\s*(\d{1,2})\b|\bitem\s+(\d{1,2})\b/i);
    return { kind: "rule", unit: rules.length === 1 ? rules[0] : undefined, units: rules, item: item?.[1] ?? item?.[2], composite: rules.length > 1 };
  }
  const articleItem = text.match(/\bart(?:igo)?\.?\s*(\d{1,4})(?:\s*[ºo])?\s*(?:,|-)\s*(?:item|n[ºo.]?)\s*(\d{1,2})\b/i);
  return articleItem ? { kind: "article-item", unit: articleItem[1], item: articleItem[2] } : null;
}
function treatyExpectedOrder(subject: TreatySubject) { return subject.unit ? [subject.unit.padStart(4, "0"), "0", (subject.item ?? "0").padStart(2, "0"), "0", "00", "0"].join(".") : undefined; }

const labels: Record<keyof DeviceReference, string> = { artigo: "artigo", letraArtigo: "letra do artigo", paragrafo: "parágrafo", letraParagrafo: "letra do parágrafo", inciso: "inciso", letraInciso: "letra do inciso" };
export function validateQuestionStructure(input: { assunto?: string | null; ordem?: string | null; lawShortName?: string | null }): StructuralValidation {
  const currentOrder = input.ordem?.trim() ?? "";
  const treaty = parseTreatyQuestionSubject(input.assunto);
  if (treaty) {
    const order = parseQuestionOrder(currentOrder);
    if (treaty.kind === "namespace") return { status: "possible_conflict", currentOrder, orderReference: order ?? undefined, message: "Referência de tratado em namespace separado; revisão necessária antes de vincular a uma unidade." };
    if (!order) return { status: "conflict", currentOrder, message: "Conflito estrutural: a Ordem não segue o padrão interno de associação." };
    if (treaty.composite) {
      if (!treaty.units?.includes(order.artigo ?? "")) return { status: "conflict", currentOrder, orderReference: order, message: "Conflito estrutural: a Ordem não corresponde a nenhuma unidade da referência composta." };
      return { status: "possible_conflict", currentOrder, orderReference: order, message: "Referência composta de tratado preservada; a associação informada requer revisão." };
    }
    const expectedOrder = treatyExpectedOrder(treaty);
    if (currentOrder !== expectedOrder) return { status: "conflict", currentOrder, expectedOrder, orderReference: order, message: "Conflito estrutural: Assunto e Ordem representam unidades de tratado diferentes." };
    return { status: "valid", currentOrder, expectedOrder, orderReference: order };
  }
  const subject = parseQuestionSubject(input.assunto);
  const order = parseQuestionOrder(currentOrder);
  if (!subject || !subject.article) return { status: "possible_conflict", currentOrder, orderReference: order ?? undefined, message: "Possível conflito: o Assunto não contém uma referência jurídica que possa ser interpretada com segurança." };
  const subjectReference = referenceFromSubject(subject);
  const expectedOrder = expectedQuestionOrder(subjectReference);
  if (!order) return { status: "conflict", currentOrder, expectedOrder, subjectReference, differences: ["formato da ordem fora do padrão estrutural"], message: "Conflito estrutural: a Ordem não segue o padrão artigo.letra_artigo.parágrafo.letra_parágrafo.inciso.letra_inciso." };
  const differences = (Object.keys(labels) as Array<keyof DeviceReference>).filter((key) => subjectReference[key] !== order[key]).map((key) => `${labels[key]} ${order[key] ? `na ordem é ${order[key]}` : "ausente na ordem"}`);
  if (!differences.length) return { status: "valid", currentOrder, expectedOrder, subjectReference, orderReference: order };
  return { status: "conflict", currentOrder, expectedOrder, subjectReference, orderReference: order, differences, message: "Conflito estrutural: Assunto e Ordem representam dispositivos diferentes." };
}

/** Incisos podem exigir o texto do parágrafo inteiro; a escolha do recorte é editorial e nunca automática. */
export function hasIncisoGranularityPending(input: { assunto?: string | null }) {
  return Boolean(parseQuestionSubject(input.assunto)?.item);
}

export function questionStructureIssues(question: { assunto?: string | null; ordem?: string | null; legislacao?: string | null; slug?: string | null }, context?: { slug: string; ordem: string }): StructuralIssue[] {
  const issues: StructuralIssue[] = [];
  if (!question.assunto?.trim()) issues.push({ code: "assunto_ausente", label: "Assunto ausente", certainty: "objective" });
  if (!question.ordem?.trim()) issues.push({ code: "ordem_ausente", label: "Ordem ausente", certainty: "objective" });
  if (!question.legislacao?.trim()) issues.push({ code: "legislacao_ausente", label: "Legislação ausente", certainty: "objective" });
  if (context && question.slug && question.slug.toLowerCase() !== context.slug.toLowerCase()) issues.push({ code: "lei_contexto", label: "Lei diferente do contexto", certainty: "objective" });
  if (question.assunto?.trim() && question.ordem?.trim()) { const validation = validateQuestionStructure(question); if (validation.status !== "valid") issues.push({ code: validation.status === "conflict" ? "assunto_ordem_divergentes" : "assunto_ordem_possivel_divergencia", label: validation.message ?? "Assunto e Ordem divergentes", certainty: validation.status === "conflict" ? "objective" : "possible" }); }
  return issues;
}

export function legislationGroups<T extends { legislacao?: string | null }>(questions: T[]) { const groups = new Map<string, number>(); for (const question of questions) { const value = (question.legislacao ?? "").trim(); groups.set(value, (groups.get(value) ?? 0) + 1); } return [...groups.entries()].map(([value, count]) => ({ value, count })); }
