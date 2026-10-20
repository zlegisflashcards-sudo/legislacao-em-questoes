import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";

const BLOCK_PAGE_MAXIMUM = 60;
const REFERENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ContinuousReadingBlockText = { id: string; legislation: string };
export type ContinuousReadingBlockTextRepository = {
  findActiveLaw: (slug: string) => Promise<{ id: number } | null>;
  findPreparedBlocks: (lawId: number, referenceIds: string[]) => Promise<ContinuousReadingBlockText[]>;
};

function requestedReferenceIds(rawIds: string[]) {
  return [...new Set(rawIds.map((id) => id.trim().toLowerCase()).filter((id) => REFERENCE_ID.test(id)))].slice(0, BLOCK_PAGE_MAXIMUM);
}

/** Busca apenas os HTMLs de um lote já presente no índice canônico da página. */
export async function getContinuousReadingBlockTexts(rawSlug: string, rawIds: string[], repository: ContinuousReadingBlockTextRepository) {
  const slug = rawSlug.trim().toLowerCase();
  const referenceIds = requestedReferenceIds(rawIds);
  if (!/^[a-z0-9_-]{1,50}$/.test(slug) || !referenceIds.length) return [] as ContinuousReadingBlockText[];
  const law = await repository.findActiveLaw(slug);
  if (!law) return null;
  const rows = await repository.findPreparedBlocks(law.id, referenceIds);
  const requested = new Set(referenceIds);
  return rows.flatMap((row) => {
    const id = String(row.id).toLowerCase();
    const legislation = sanitizeLegalHtmlCore(String(row.legislation ?? "")).trim();
    return requested.has(id) && legislation ? [{ id, legislation }] : [];
  });
}
