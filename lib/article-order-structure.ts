import { parseQuestionSubject } from "@/lib/question-structure-consistency";

type ArticleOrderStructure = { articleKey: string; block: string; subblock: string; reference: string };

function partsOf(ordem: string) { return ordem.trim().split(".").filter(Boolean); }
function numericPart(value: string | undefined) { return value && /^\d+$/.test(value) ? String(Number(value)) : value?.toUpperCase() ?? ""; }

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
