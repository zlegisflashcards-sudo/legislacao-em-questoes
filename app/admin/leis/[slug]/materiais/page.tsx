import { notFound } from "next/navigation";
import { LawMaterialsAdmin } from "@/components/admin/admin-materials";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export default async function AdminLawMaterialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  return <div data-law-area="materiais"><LawMaterialsAdmin law={{ id: law.id, slug: law.slug, titulo: law.titulo }} /></div>;
}
