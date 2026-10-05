import Link from "next/link";
import { AdminLawListFilters } from "@/components/admin/admin-law-list-filters";
import { exigirAdministrador } from "@/lib/admin-auth";
import { listAdminLawCenterLaws } from "@/lib/admin-law-center-server";
import { publicationStatusLabel } from "@/lib/publication-status";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

function pageNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function lawsHref({ q, conferencia, page }: { q: string; conferencia: string; page?: number }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (conferencia !== "todas") params.set("conferencia", conferencia);
  if (page && page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin/leis?${search}` : "/admin/leis";
}

export default async function AdminLawsPage({ searchParams }: { searchParams: Promise<{ q?: string; conferencia?: string; page?: string }> }) {
  await exigirAdministrador();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const result = await listAdminLawCenterLaws({ query, conference: params.conferencia, page: pageNumber(params.page), limit: PAGE_SIZE });
  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Administração de conteúdo</div><h1>Central das Leis</h1><p>Selecione uma lei uma vez para administrar seus dados e sua estrutura.</p></div><Link className="admin-button primary" href="/admin/leis/nova">Nova lei</Link></header>
    <AdminLawListFilters query={query} conference={result.conference} />
    <section className="mt-5 grid gap-3" aria-label="Leis cadastradas">
      <p className="text-sm text-slate-600">{result.total} lei(s) encontrada(s) · filtro: {result.conference === "conferida" ? "Conferida" : result.conference === "para_conferir" ? "Para conferir" : "Todas"} · página {result.page} de {result.pages}</p>
      {result.laws.map((law) => <Link key={law.id} className="commercial-card flex flex-col gap-3 transition hover:border-blue-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between" href={`/admin/leis/${encodeURIComponent(law.slug)}/questoes`}><div className="min-w-0"><h2 className="break-words">{law.titulo}</h2><p className="break-words text-sm text-slate-600">{law.codigo ? `${String(law.codigo)} · ` : ""}{publicationStatusLabel(law.status_publicacao)}</p></div><span className="admin-button primary shrink-0">Abrir questões</span></Link>)}
      {!result.laws.length ? <article className="commercial-card"><h2>Nenhuma lei encontrada</h2><p>Revise a pesquisa ou o filtro de conferência.</p></article> : null}
    </section>
    {result.pages > 1 ? <nav className="mt-5 flex flex-wrap items-center justify-between gap-3" aria-label="Paginação das leis"><Link aria-disabled={result.page === 1} className={`admin-button secondary ${result.page === 1 ? "pointer-events-none opacity-50" : ""}`} href={lawsHref({ q: query, conferencia: result.conference, page: result.page - 1 })}>← Anterior</Link><span className="text-sm text-slate-600">Página {result.page} de {result.pages}</span><Link aria-disabled={result.page === result.pages} className={`admin-button secondary ${result.page === result.pages ? "pointer-events-none opacity-50" : ""}`} href={lawsHref({ q: query, conferencia: result.conference, page: result.page + 1 })}>Próxima →</Link></nav> : null}
  </main>;
}
