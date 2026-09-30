import { createHash } from "node:crypto";
import { legalHtmlToStructuredText } from "./sanitize-legal-html-core";
import { normalizedLegisBotLegislation } from "./source";

export type LegisBotConflictQuestion = {
  id: string;
  lei_id: number;
  slug: string;
  ordem: string;
  titulo: string | null;
  assunto: string | null;
  legislacao: string | null;
  pergunta: string;
  resposta: string;
  justificativa: string | null;
  ativo: boolean;
  updated_at: string;
};

export type LegisBotConflictGroup = {
  key: string;
  slug: string;
  ordem: string;
  questions: LegisBotConflictQuestion[];
  versions: Map<string, LegisBotConflictQuestion[]>;
};

export type TextDifference = { text: string; changed: boolean };

export function legislationVersionId(legislacao: string | null) {
  return createHash("sha256").update(normalizedLegisBotLegislation(legislacao ?? "")).digest("hex");
}

export function groupLegisBotSourceConflicts(rows: LegisBotConflictQuestion[]) {
  const pairs = new Map<string, LegisBotConflictQuestion[]>();
  for (const row of rows.filter((item) => item.ativo)) {
    const key = `${row.slug.trim().toUpperCase()}\u0000${row.ordem.trim()}`;
    pairs.set(key, [...(pairs.get(key) ?? []), row]);
  }
  const conflicts: LegisBotConflictGroup[] = [];
  for (const [key, questions] of pairs) {
    const versions = new Map<string, LegisBotConflictQuestion[]>();
    for (const question of questions) {
      const version = legislationVersionId(question.legislacao);
      versions.set(version, [...(versions.get(version) ?? []), question]);
    }
    if (versions.size > 1) conflicts.push({ key, slug: questions[0].slug.toUpperCase(), ordem: questions[0].ordem, questions, versions });
  }
  return conflicts.sort((a, b) => a.slug.localeCompare(b.slug, "pt-BR") || a.ordem.localeCompare(b.ordem, "pt-BR", { numeric: true }));
}

/** Destaca o miolo diferente preservando o texto legal sem reinterpretá-lo. */
export function compareLegislationText(currentHtml: string | null, referenceHtml: string | null): TextDifference[] {
  const current = legalHtmlToStructuredText(currentHtml ?? "");
  const reference = legalHtmlToStructuredText(referenceHtml ?? "");
  if (!current || current === reference) return current ? [{ text: current, changed: false }] : [];
  let prefix = 0;
  const maxPrefix = Math.min(current.length, reference.length);
  while (prefix < maxPrefix && current[prefix] === reference[prefix]) prefix += 1;
  let suffix = 0;
  const maxSuffix = Math.min(current.length - prefix, reference.length - prefix);
  while (suffix < maxSuffix && current[current.length - 1 - suffix] === reference[reference.length - 1 - suffix]) suffix += 1;
  return [
    ...(prefix ? [{ text: current.slice(0, prefix), changed: false }] : []),
    { text: current.slice(prefix, current.length - suffix || undefined), changed: true },
    ...(suffix ? [{ text: current.slice(current.length - suffix), changed: false }] : []),
  ].filter((part) => part.text);
}
