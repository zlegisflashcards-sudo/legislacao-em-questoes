import { parseQuestionOrder, parseQuestionSubject } from "@/lib/question-structure-consistency";

type ArticleOrderStructure = { articleKey: string; block: string; subblock: string; reference: string };

function partsOf(ordem: string) { return ordem.trim().split(".").filter(Boolean); }
function numericPart(value: string | undefined) { return value && /^\d+$/.test(value) ? String(Number(value)) : value?.toUpperCase() ?? ""; }

const romanNumerals: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

function roman(value: string) {
  let remaining = Number(value);
  if (!Number.isSafeInteger(remaining) || remaining < 1) return null;
  let result = "";
  for (const [amount, symbol] of romanNumerals) {
    while (remaining >= amount) { result += symbol; remaining -= amount; }
  }
  return result;
}

function legalArticleNumber(value: string) {
  return Number(value) < 10 ? `${value}º` : value;
}

/**
 * Identifica um dispositivo exclusivamente pela Ordem canônica e pelo nome
 * curto cadastrado da lei. Sem esses metadados, retorna null em vez de
 * adivinhar a filiação a partir de cartões vizinhos ou do texto legislativo.
 */
export function formatLegalReferenceFromOrder(ordem: string, lawShortName: string | null | undefined) {
  const parsed = parseQuestionOrder(ordem);
  const shortName = lawShortName?.trim();
  if (!parsed?.artigo || !shortName) return null;
  const levels = [`Art. ${legalArticleNumber(parsed.artigo)}${parsed.letraArtigo ? `-${parsed.letraArtigo}` : ""}`];
  if (parsed.paragrafo) levels.push(`§ ${parsed.paragrafo}º${parsed.letraParagrafo ? `-${parsed.letraParagrafo}` : ""}`);
  if (parsed.inciso) levels.push(roman(parsed.inciso) ?? parsed.inciso);
  if (parsed.letraInciso) levels.push(`"${parsed.letraInciso.toLowerCase()}"`);
  return `${levels.join(", ")}, ${shortName}`;
}

/**
 * The first segment of `ordem` is the article number.  Lettered articles are
 * disambiguated through the already-established subject parser: e.g. 0091.01
 * belongs to Art. 91-A rather than Art. 91.
 */
export function articleOrderStructure(ordem: string, assunto?: string | null): ArticleOrderStructure {
  const parts = partsOf(ordem);
  const subject = parseQuestionSubject(assunto);
  const article = subject?.article ?? numericPart(parts[0]) ?? ordem;
  const suffix = subject?.suffix ? `-${subject.suffix}` : "";
  const block = `Art. ${article}${suffix}`;
  const levels: string[] = [];
  const paragraphFromSubject = assunto?.match(/§\s*(?:\d+\s*(?:º|o)?(?:\s*-\s*[A-Za-z])?|único)/i)?.[0].replace(/\s*-\s*/g, "-");
  const itemFromSubject = assunto?.match(/(?:inciso\s+|,\s*)([ivxlcdm]+)\b/i)?.[1].toUpperCase();
  if (subject?.unique) levels.push("§ único");
  else if (paragraphFromSubject) levels.push(paragraphFromSubject);
  else if (subject?.paragraph) levels.push(`§ ${subject.paragraph}º`);
  if (subject?.item ?? itemFromSubject) levels.push(subject?.item ?? itemFromSubject!);
  if (subject?.letter) levels.push(`“${subject.letter}”`);
  const fallbackLevels = parts.slice(1);
  const subblock = levels.length ? levels.join(", ") : fallbackLevels.some((part) => Number(part.replace(/\D/g, "")) > 0) ? `Subbloco ${fallbackLevels.join(".")}` : "caput";
  return { articleKey: `${article}${suffix}`.toUpperCase(), block, subblock, reference: subblock === "caput" ? block : `${block}, ${subblock}` };
}
