"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AdjacentLaw = { slug: string; titulo: string };
type Navigation = { previous: AdjacentLaw | null; next: AdjacentLaw | null; total: number; selectedProduct: { id: string; nome: string; tipo_produto: "edital" | "combo" } | null; selectedCategory: string };

function scopedParams(params: URLSearchParams) {
  const scope = new URLSearchParams();
  for (const key of ["q", "produto", "categoria", "conferencia"]) {
    const value = params.get(key);
    if (value) scope.set(key, value);
  }
  return scope;
}

export function LawContextNavigation({ lawId, listLabel = "Trocar lei" }: { lawId: number; listLabel?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const scope = useMemo(() => scopedParams(params), [params]);
  const scopeKey = scope.toString();
  const [navigation, setNavigation] = useState<Navigation | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!scopeKey) { setNavigation(null); return () => controller.abort(); }
    fetch(`/api/admin/leis/navegacao?lawId=${encodeURIComponent(String(lawId))}&${scopeKey}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: Navigation | null) => { if (!controller.signal.aborted) setNavigation(data); })
      .catch(() => { if (!controller.signal.aborted) setNavigation(null); });
    return () => controller.abort();
  }, [lawId, scopeKey, scope]);

  const listHref = `/admin/leis${scopeKey ? `?${scopeKey}` : ""}`;
  // Mantém a seção atual (questões, dados etc.) ao avançar na conferência.
  const sectionHref = (law: AdjacentLaw) => {
    const current = pathname.match(/^\/admin\/leis\/[^/]+(\/.*)?$/)?.[1] ?? "/questoes";
    return `/admin/leis/${encodeURIComponent(law.slug)}${current}${scopeKey ? `?${scopeKey}` : ""}`;
  };
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {navigation?.previous ? <Link className="admin-button secondary" href={sectionHref(navigation.previous)} title={navigation.previous.titulo}>← Anterior</Link> : null}
    {navigation?.next ? <Link className="admin-button secondary" href={sectionHref(navigation.next)} title={navigation.next.titulo}>Próxima →</Link> : null}
    <Link className="admin-button secondary" href={listHref}>{listLabel}</Link>
  </div>;
}
