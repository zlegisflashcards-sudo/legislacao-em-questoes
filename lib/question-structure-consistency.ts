export type StructuralIssue = { code: string; label: string; certainty: "objective" | "possible" };
export type StructuralStatus = "valid" | "conflict" | "possible_conflict";
export type DeviceReference = { artigo?: string; letraArtigo?: string; paragrafo?: string; letraParagrafo?: string; inciso?: string; letraInciso?: string };
export type StructuralValidation = { status: StructuralStatus; currentOrder: string; expectedOrder?: string; subjectReference?: DeviceReference; orderReference?: DeviceReference; differences?: string[]; message?: string };

type SubjectStructure = { article?: string; suffix?: string; paragraph?: string; paragraphSuffix?: string; unique?: boolean; item?: string; itemSuffix?: string; letter?: string };
const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizedLawReference = (value: string) => clean(value).replace(/[^a-z0-9]+/g, " ").replace(/\bn\b/g, " ").replace(/\s+/g, " ").trim();
function lawReferenceDifference(subject: string | null | undefined, lawShortName: string | null | undefined) {
  const expectedLawReference = lawShortName?.trim();
  if (!expectedLawReference) return null;
  const expected = normalizedLawReference(expectedLawReference);
  const actual = normalizedLawReference(subject ?? "");
  if (!expected || ` ${actual} `.includes(` ${expected} `)) return null;
  return /\blei\b/i.test(subject ?? "") ? `lei divergente: esperado ${expectedLawReference}` : `referência divergente: esperado ${expectedLawReference}`;
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

const labels: Record<keyof DeviceReference, string> = { artigo: "artigo", letraArtigo: "letra do artigo", paragrafo: "parágrafo", letraParagrafo: "letra do parágrafo", inciso: "inciso", letraInciso: "letra do inciso" };
export function validateQuestionStructure(input: { assunto?: string | null; ordem?: string | null; lawShortName?: string | null }): StructuralValidation {
  const currentOrder = input.ordem?.trim() ?? "";
  const subject = parseQuestionSubject(input.assunto);
  const order = parseQuestionOrder(currentOrder);
  const lawDifference = lawReferenceDifference(input.assunto, input.lawShortName);
  if (!subject || !subject.article) return lawDifference ? { status: "conflict", currentOrder, orderReference: order ?? undefined, differences: [lawDifference], message: "Conflito estrutural: o Assunto não corresponde à referência curta cadastrada para a lei." } : { status: "possible_conflict", currentOrder, orderReference: order ?? undefined, message: "Possível conflito: o Assunto não contém uma referência jurídica que possa ser interpretada com segurança." };
  const subjectReference = referenceFromSubject(subject);
  const expectedOrder = expectedQuestionOrder(subjectReference);
  if (!order) return { status: "conflict", currentOrder, expectedOrder, subjectReference, differences: ["formato da ordem fora do padrão estrutural"], message: "Conflito estrutural: a Ordem não segue o padrão artigo.letra_artigo.parágrafo.letra_parágrafo.inciso.letra_inciso." };
  const differences = (Object.keys(labels) as Array<keyof DeviceReference>).filter((key) => subjectReference[key] !== order[key]).map((key) => `${labels[key]} ${order[key] ? `na ordem é ${order[key]}` : "ausente na ordem"}`);
  if (lawDifference) differences.push(lawDifference);
  if (!differences.length) return { status: "valid", currentOrder, expectedOrder, subjectReference, orderReference: order };
  const hasLawDifference = differences.some((item) => item.startsWith("lei divergente") || item.startsWith("referência divergente"));
  return { status: "conflict", currentOrder, expectedOrder, subjectReference, orderReference: order, differences, message: hasLawDifference ? "Conflito estrutural: o Assunto não corresponde à referência curta cadastrada para a lei." : "Conflito estrutural: Assunto e Ordem representam dispositivos diferentes." };
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
