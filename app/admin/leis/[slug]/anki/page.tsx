import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminQuestionAnkiTools } from "@/components/admin/admin-question-anki-tools";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export default async function AdminLawAnkiPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="anki"><h2>Anki</h2><p>Esta lei está inativa. Ative-a em Dados da lei antes de usar as ferramentas Anki.</p><Link className="admin-button primary" href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link></article>;
  return <div data-law-area="anki"><AdminQuestionAnkiTools lawSlug={law.slug} lawName={law.titulo} /></div>;
}
