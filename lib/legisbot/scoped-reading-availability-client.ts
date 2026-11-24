"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const pending = new Map<string, Promise<ReadonlySet<number>>>();
const empty = new Set<number>();

export function useScopedReadingAvailability(slug: string | null, recorteId: string | null) {
  const key = slug && recorteId ? `${slug}:${recorteId}` : null;
  const [result, setResult] = useState<{ key: string; ids: ReadonlySet<number> } | null>(null);
  useEffect(() => {
    if (!key || !slug || !recorteId) return;
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session || !live) return;
      const requestKey = `${session.user.id}:${key}`;
      let request = pending.get(requestKey);
      if (!request) {
        const query = new URLSearchParams({ recorte_id: recorteId, availability: "1" });
        request = fetch(`/api/legisbot/${encodeURIComponent(slug)}/reading?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) return empty;
            const body = await response.json() as { structureIds?: number[] };
            return new Set((body.structureIds ?? []).filter(Number.isSafeInteger));
          }).catch(() => empty).finally(() => pending.delete(requestKey));
        pending.set(requestKey, request);
      }
      const ids = await request;
      if (live) setResult({ key, ids });
    })().catch(() => { if (live) setResult({ key, ids: empty }); });
    return () => { live = false; };
  }, [key, slug, recorteId]);
  return key !== null && result?.key === key ? result.ids : empty;
}
