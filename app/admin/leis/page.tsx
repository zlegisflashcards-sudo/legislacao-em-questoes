import Link from "next/link";
import { exigirAdministrador } from "@/lib/admin-auth";
import { listAdminLawCenterLaws } from "@/lib/admin-law-center-server";
import { publicationStatusLabel } from "@/lib/publication-status";

export const dynamic = "force-dynamic";

export default async function AdminLawsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigirAdministrador();
  const query = (await searchParams).q?.trim() ?? "";
  const laws = await listAdminLawCenterLaws(query);
  return <main className="admin-shell commercial-admin-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Administração de conteúdo</div><h1>Central das Leis</h1><p>Selecione uma lei uma vez para administrar seus dados e sua estrutura.</p></div><Link className="admin-button primary" href="/admin/leis/nova">Nova lei</Link></header>
    <form className="commercial-card flex flex-col gap-3 sm:flex-row sm:items-end" action="/admin/leis">
      <label className="min-w-0 flex flex-1 flex-col gap-2">Pesquisar lei<input name="q" defaultValue={query} placeholder="Título, slug, nome curto ou código" /></label>
      <button className="admin-button primary">Pesquisar</button>
      {query ? <Link className="admin-button secondary" href="/admin/leis">Limpar</Link> : null}
    </form>
    <section className="mt-5 grid gap-3" aria-label="Leis cadastradas">
      {laws.map((law) => <article key={law.id} className="commercial-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="break-words">{law.titulo}</h2><p className="break-words text-sm text-slate-600">{law.codigo ? `${String(law.codigo)} · ` : ""}{publicationStatusLabel(law.status_publicacao)}</p></div><Link className="admin-button primary shrink-0" href={`/admin/leis/${encodeURIComponent(law.slug)}`}>Abrir central</Link></article>)}
      {!laws.length ? <article className="commercial-card"><h2>Nenhuma lei encontrada</h2><p>Revise o termo pesquisado.</p></article> : null}
    </section>
  </main>;
}
