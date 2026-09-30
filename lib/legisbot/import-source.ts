import { legalHtmlToStructuredText } from "./sanitize-legal-html-core";
import { normalizedLegisBotLegislation, normalizedLegisBotSourceText } from "./source";

export type ImportSourceFields = {
  slug: string;
  ordem: string;
  titulo: string;
  assunto: string;
  legislacao: string;
};

export type ImportSourceWarning = {
  key: string;
  slug: string;
  ordem: string;
  kind: "legislacao" | "metadados";
  flashcards: number;
  versions: number;
  message: string;
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
  return JSON.stringify([
    normalizedLegisBotSourceText(value.titulo),
    normalizedLegisBotSourceText(value.assunto),
    normalizedLegisBotLegislation(value.legislacao),
  ]);
}

export function normalizedImportLegislation(value: Pick<ImportSourceFields, "legislacao">) {
  return normalizedLegisBotLegislation(value.legislacao);
}

export function conflictingImportSourceGroups(rows: ImportSourceFields[]) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = importSourceKey(row);
    const signatures = groups.get(key) ?? new Set<string>();
    signatures.add(normalizedImportLegislation(row));
    groups.set(key, signatures);
  }
  return new Set([...groups].filter(([, signatures]) => signatures.size > 1).map(([key]) => key));
}

/** Agrupa pendências editoriais sem transformá-las em falhas da importação. */
export function groupImportSourceWarnings(rows: ImportSourceFields[]): ImportSourceWarning[] {
  const groups = new Map<string, ImportSourceFields[]>();
  for (const row of rows) {
    const key = importSourceKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const warnings: ImportSourceWarning[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const legislationVersions = new Set(items.map(normalizedImportLegislation));
    const metadataVersions = new Set(items.map((item) => JSON.stringify([
      normalizedLegisBotSourceText(item.titulo),
      normalizedLegisBotSourceText(item.assunto),
    ])));
    const common = { key, slug: items[0].slug.trim().toUpperCase(), ordem: items[0].ordem.trim(), flashcards: items.length };
    if (legislationVersions.size > 1) {
      warnings.push({ ...common, kind: "legislacao", versions: legislationVersions.size, message: "Versões diferentes da legislação serão revisadas na Central do Artigo." });
    } else if (metadataVersions.size > 1) {
      warnings.push({ ...common, kind: "metadados", versions: metadataVersions.size, message: "Título ou assunto divergente; a legislação normalizada é equivalente." });
    }
  }
  return warnings.sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR") || a.ordem.localeCompare(b.ordem, "pt-BR", { numeric: true }));
}
