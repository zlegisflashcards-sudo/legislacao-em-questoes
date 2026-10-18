export type LegislativeReferenceIdentifierInput = {
  id: string;
  ordem: string;
  identification: string;
  legislation: string | null;
  updatedAt?: string;
};

export type LegislativeReferenceIdentifierRepair = LegislativeReferenceIdentifierInput & {
  legislation: string;
  repairedLegislation: string;
};

const decode = (value: string) => value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
const plain = (value: string) => decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only legal article and paragraph labels are eligible for this conservative repair. */
export function legalIdentifier(identification: string) {
  const value = identification.replace(/\s+/g, " ").trim();
  return /^(?:Art\.\s*\d+(?:\s*º|\s*o)?(?:\s*-\s*[A-Za-z])?\.?|§\s*(?:\d+(?:\s*º|\s*o)?|único)(?:\s*-\s*[A-Za-z])?\.?)/i.test(value) ? value : null;
}

export function hasLeadingLegalIdentifier(legislation: string) {
  return /^(?:Art\.\s*\d+(?:\s*º|\s*o)?|§\s*(?:\d+(?:\s*º|\s*o)?|único))/i.test(plain(legislation));
}

export function prependLegalIdentifier(legislation: string, identification: string) {
  const prefix = legalIdentifier(identification);
  const content = legislation.trim();
  if (!prefix || !content || hasLeadingLegalIdentifier(content)) return content;
  const escaped = escapeHtml(prefix);
  const firstParagraph = /^<p(\s[^>]*)?>/i.exec(content);
  if (firstParagraph) return `${firstParagraph[0]}${escaped} ${content.slice(firstParagraph[0].length)}`;
  return `${escaped} ${content}`;
}

export function planLegislativeReferenceIdentifierRepair(input: LegislativeReferenceIdentifierInput): LegislativeReferenceIdentifierRepair | null {
  const legislation = input.legislation?.trim() ?? "";
  const repairedLegislation = prependLegalIdentifier(legislation, input.identification);
  return legislation && repairedLegislation !== legislation ? { ...input, legislation, repairedLegislation } : null;
}
