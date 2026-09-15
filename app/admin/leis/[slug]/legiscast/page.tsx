import Link from "next/link";
import { notFound } from "next/navigation";
import { LegiscastAudiosAdmin } from "@/components/admin/legiscast-audios-admin";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export default async function AdminLawLegiscastPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="legiscast">
    <h2>LegisCast</h2>
    <p>Esta lei está inativa. Ative-a em Dados da lei antes de gerenciar seus áudios.</p>
    <Link className="admin-button primary" href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link>
  </article>;
  return <div data-law-area="legiscast"><LegiscastAudiosAdmin lawContext={{ id: law.id, slug: law.slug, titulo: law.titulo }} /></div>;
}
