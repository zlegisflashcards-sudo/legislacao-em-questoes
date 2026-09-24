import Link from "next/link";
import { notFound } from "next/navigation";
import { LawStructurePageClient } from "@/components/admin/law-structure-page-client";
import type { AdminLawStructureNode } from "@/components/admin/law-structure-admin";
import { getAdminLawBySlug, getAdminLawStructure } from "@/lib/admin-law-center-server";

export default async function AdminLawStructurePage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  if (!law.ativo) return <article className="commercial-card law-center-empty" data-law-area="estrutura">
    <h2>Estrutura da legislação</h2>
    <p>Esta lei está inativa. Ative-a em Dados da lei antes de alterar sua estrutura.</p>
    <Link href={`/admin/leis/${encodeURIComponent(law.slug)}/dados`}>Abrir Dados da lei</Link>
  </article>;
  const nodes = await getAdminLawStructure(law.id);
  return <div data-law-area="estrutura"><LawStructurePageClient lawSlug={law.slug} lawName={law.titulo} initialNodes={nodes as AdminLawStructureNode[]} /></div>;
}
