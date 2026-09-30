import { legalHtmlToStructuredText } from "./sanitize-legal-html-core";

export type ImportSourceFields = {
  slug: string;
  ordem: string;
  titulo: string;
  assunto: string;
  legislacao: string;
};

export function importSourceKey(value: Pick<ImportSourceFields, "slug" | "ordem">) {
  return `${value.slug.trim().toUpperCase()}\u0000${value.ordem.trim()}`;
}
export function validateImportSource(value: ImportSourceFields): string | null {
  if (!value.slug.trim()) return "slug é obrigatório para disponibilizar o flashcard ao LegisBot.";
  if (!value.ordem.trim()) return "ordem é obrigatória para disponibilizar o flashcard ao LegisBot.";
  if (!value.titulo.trim()) return "titulo é obrigatório para disponibilizar o flashcard ao LegisBot.";
  if (!value.assunto.trim()) return "assunto é obrigatório para disponibilizar o flashcard ao LegisBot.";
  if (!legalHtmlToStructuredText(value.legislacao)) return "legislacao é obrigatória para disponibilizar o flashcard ao LegisBot.";
  return null;
}

export function normalizedImportSource(value: Pick<ImportSourceFields, "titulo" | "assunto" | "legislacao">) {
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR");
  return JSON.stringify([
    normalize(value.titulo),
    normalize(value.assunto),
    normalize(legalHtmlToStructuredText(value.legislacao)),
  ]);
}

export function conflictingImportSourceGroups(rows: ImportSourceFields[]) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = importSourceKey(row);
    const signatures = groups.get(key) ?? new Set<string>();
    signatures.add(normalizedImportSource(row));
    groups.set(key, signatures);
  }
  return new Set([...groups].filter(([, signatures]) => signatures.size > 1).map(([key]) => key));
}
