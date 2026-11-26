"use client";

import Link from "next/link";
import { useRef } from "react";
import type { AdminLawConferenceFilter } from "@/lib/admin-law-listing";
import type { AdminLawCategoryFilter, AdminLawProductFilter } from "@/lib/admin-law-center-server";

export function AdminLawListFilters({ query, conference, products, productId, categories, category }: { query: string; conference: AdminLawConferenceFilter; products: AdminLawProductFilter[]; productId: string; categories: AdminLawCategoryFilter[]; category: string }) {
  const form = useRef<HTMLFormElement>(null);
  return <form ref={form} className="commercial-card admin-law-list-filters" action="/admin/leis">
    <header><div><p>Localizar leis</p><h2>Filtros da Central</h2></div><span>Refine a lista ou fixe um edital para seguir a conferência.</span></header>
    <div className="admin-law-list-filter-grid">
      <label>Pesquisar lei<input name="q" defaultValue={query} placeholder="Título, slug, nome curto ou código" /></label>
      <label>Conferência<select name="conferencia" defaultValue={conference} onChange={() => form.current?.requestSubmit()}><option value="todas">Todas</option><option value="para_conferir">Para conferir</option><option value="conferida">Conferida</option></select></label>
      <label className="admin-law-list-product">Edital ou combo<select name="produto" defaultValue={productId} onChange={() => form.current?.requestSubmit()}><option value="">Todos</option>{products.map((product) => <option key={product.id} value={product.id}>{product.tipo_produto === "edital" ? "Edital" : "Combo"}: {product.nome}</option>)}</select></label>
      <label>Tipo de lei<select name="categoria" defaultValue={category} onChange={() => form.current?.requestSubmit()}><option value="">Todos</option>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    </div>
    <footer><button className="admin-button primary">Pesquisar</button>{query || conference !== "todas" || productId || category ? <Link className="admin-button secondary" href="/admin/leis">Limpar filtros</Link> : null}</footer>
  </form>;
}
