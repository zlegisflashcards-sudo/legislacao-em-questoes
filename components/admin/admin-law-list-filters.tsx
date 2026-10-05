"use client";

import Link from "next/link";
import { useRef } from "react";
import type { AdminLawConferenceFilter } from "@/lib/admin-law-listing";

export function AdminLawListFilters({ query, conference }: { query: string; conference: AdminLawConferenceFilter }) {
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} className="commercial-card flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" action="/admin/leis">
    <label className="min-w-0 flex flex-1 flex-col gap-2">Pesquisar lei<input name="q" defaultValue={query} placeholder="Título, slug, nome curto ou código" /></label>
    <label className="flex flex-col gap-2">Conferência<select name="conferencia" defaultValue={conference} onChange={() => form.current?.requestSubmit()}><option value="todas">Todas</option><option value="para_conferir">Para conferir</option><option value="conferida">Conferida</option></select></label>
    <button className="admin-button primary">Pesquisar</button>
    {query || conference !== "todas" ? <Link className="admin-button secondary" href="/admin/leis">Limpar</Link> : null}
  </form>;
}
