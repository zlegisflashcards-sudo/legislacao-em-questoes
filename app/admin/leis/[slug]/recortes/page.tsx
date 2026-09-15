import Link from "next/link";
import { notFound } from "next/navigation";
import { LawScopesPanel } from "@/components/admin/admin-question-scopes";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export default async function AdminLawScopesPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="recortes"><h2>Recortes</h2><p>Esta lei está inativa. Ative-a em Dados da lei antes de gerenciar seus Recortes.</p><Link className="admin-button primary" href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link></article>;
  return <div data-law-area="recortes"><LawScopesPanel lawSlug={law.slug} /></div>;
}
