export type ConferenceListUuidPreview = {
  total_received: number;
  valid_unique: string[];
  duplicate_ids: string[];
  invalid_ids: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Extracts UUIDs from a TXT/CSV export without changing its source order. */
export function previewConferenceListUuids(source: unknown): ConferenceListUuidPreview {
  if (typeof source !== "string") throw new Error("Informe os UUIDs em texto.");
  if (source.length > 1_000_000) throw new Error("O arquivo excede o limite de 1 MB.");
  const received = source.replace(/^\uFEFF/, "").split(/[\s,;|]+/).map((value) => value.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const valid_unique: string[] = [];
  const duplicate_ids: string[] = [];
  const invalid_ids: string[] = [];
  const seen = new Set<string>();
  for (const value of received) {
    const uuid = value.toLowerCase();
    if (!UUID.test(uuid)) { invalid_ids.push(value); continue; }
    if (seen.has(uuid)) { if (!duplicate_ids.includes(uuid)) duplicate_ids.push(uuid); continue; }
    seen.add(uuid); valid_unique.push(uuid);
  }
  if (valid_unique.length > 10_000) throw new Error("A lista aceita no máximo 10.000 UUIDs por importação.");
  return { total_received: received.length, valid_unique, duplicate_ids, invalid_ids };
}
