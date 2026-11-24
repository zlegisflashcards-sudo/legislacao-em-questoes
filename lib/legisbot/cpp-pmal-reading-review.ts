import "server-only";

export type CppPmalReviewPin = [id: string, structureId: number, order: string, label: string, digest: string];

export function parseCppPmalReview(raw: string | undefined): CppPmalReviewPin[] | null {
  if (!raw || raw.length > 32000) return null;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(data) || data.length !== 77) return null;
  const result: CppPmalReviewPin[] = [];
  const ids = new Set<string>();
  const orders = new Set<string>();
  let inquiryCount = 0;
  for (const row of data) {
    if (!Array.isArray(row) || row.length !== 5) return null;
    const [id, structure, order, label, digest] = row;
    if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || ids.has(id) ||
        (structure !== 608 && structure !== 609) ||
        typeof order !== "string" || !/^\d{4}\.\d+\.\d+\.\d+\.\d+\.\d+$/.test(order) || orders.has(order) ||
        (result.length > 0 && order <= result[result.length - 1][2]) ||
        typeof label !== "string" || !label.trim() || label.length > 150 ||
        typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return null;
    const article = Number(order.slice(0, 4));
    if (structure === 608) { if (article < 4 || article > 23) return null; inquiryCount++; }
    if (structure === 609 && (article < 24 || article > 62)) return null;
    ids.add(id);
    orders.add(order);
    result.push([id, structure, order, label, digest]);
  }
  return inquiryCount === 23 ? result : null;
}
