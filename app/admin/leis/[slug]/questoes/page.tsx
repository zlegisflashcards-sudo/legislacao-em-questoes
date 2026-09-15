import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLawQuestions } from "@/components/admin/admin-law-questions";
import type { AdminQuestionStructureNode } from "@/components/admin/admin-question-editor";
import { getAdminLawBySlug, getAdminLawStructure } from "@/lib/admin-law-center-server";

export default async function AdminLawQuestionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="questoes"><h2>Questões</h2><p>Esta lei está inativa. Ative-a em Dados da lei antes de gerenciar suas questões.</p><Link className="admin-button primary" href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link></article>;
  const structure = await getAdminLawStructure(law.id);
  return <div data-law-area="questoes"><AdminLawQuestions law={{ id: law.id, slug: law.slug, titulo: law.titulo }} initialStructure={structure as AdminQuestionStructureNode[]} /></div>;
}
