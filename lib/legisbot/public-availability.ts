export type PublicInteractiveLawAvailability = {
  status: "ready" | "preparing";
  lawName: string;
};

type ReadingModel = {
  law: { nome_curto: string | null; titulo: string };
  integrity: { readingAvailable: boolean };
};

type CacheEntry = { value: PublicInteractiveLawAvailability | null; expiresAt: number };

/**
 * Per-process cache for the small public readiness projection. It keeps no
 * student data or legislative text, and coalesces simultaneous modal opens.
 */
export function createPublicAvailabilityResolver(load: (slug: string) => Promise<ReadingModel | null>, now: () => number = Date.now, ttlMs = 30_000) {
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<PublicInteractiveLawAvailability | null>>();

  return async function resolve(rawSlug: string) {
    const slug = rawSlug.trim().toLowerCase();
    const current = cache.get(slug);
    if (current && current.expiresAt > now()) return current.value;
    const inFlight = pending.get(slug);
    if (inFlight) return inFlight;

    const request = load(slug).then((model) => {
      const value = model ? { status: model.integrity.readingAvailable ? "ready" as const : "preparing" as const, lawName: model.law.nome_curto || model.law.titulo } : null;
      cache.set(slug, { value, expiresAt: now() + ttlMs });
      return value;
    }).finally(() => pending.delete(slug));
    pending.set(slug, request);
    return request;
  };
}
