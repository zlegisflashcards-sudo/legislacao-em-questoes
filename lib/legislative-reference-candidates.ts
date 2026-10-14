import { articleOrderStructure } from "@/lib/article-order-structure";

type QuestionCandidate = {
  id: string;
  slug: string;
  ordem: string;
  assunto: string | null;
};

export type LegislativeReferenceCandidate = {
  sourceQuestionId: string;
  slug: string;
  ordem: string;
  identification: string;
};

const text = (value: unknown, maximum = 20_000) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

/** Collapses by stable identity only; legislation is deliberately excluded. */
export function referenceCandidatesFromQuestions(rows: QuestionCandidate[]): LegislativeReferenceCandidate[] {
  const candidates = new Map<string, LegislativeReferenceCandidate>();
  for (const row of rows) {
    const slug = row.slug.trim().toLowerCase();
    const ordem = row.ordem.trim();
    if (!slug || !ordem) continue;
    const key = `${slug}\u0000${ordem}`;
    if (candidates.has(key)) continue;
    const derived = articleOrderStructure(ordem, row.assunto);
    candidates.set(key, {
      sourceQuestionId: row.id,
      slug,
      ordem,
      identification: text(row.assunto, 500) || derived.reference,
    });
  }
  return [...candidates.values()].sort((left, right) => left.ordem.localeCompare(right.ordem));
}

export function referencesNotYetStored<T extends { slug: string; ordem: string }>(
  candidates: LegislativeReferenceCandidate[],
  stored: T[],
) {
  const existing = new Set(stored.map((item) => `${item.slug.trim().toLowerCase()}\u0000${item.ordem.trim()}`));
  return candidates.filter((item) => !existing.has(`${item.slug}\u0000${item.ordem}`));
}
