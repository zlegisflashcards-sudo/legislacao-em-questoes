import { notFound } from "next/navigation";
import { LawDataAdmin } from "@/components/admin/law-data-admin";
import { getAdminLawBySlug } from "@/lib/admin-law-center-server";

export default async function AdminLawDataPage({ params }: { params: Promise<{ slug: string }> }) {
  const law = await getAdminLawBySlug((await params).slug);
  if (!law) notFound();
  return <div data-law-area="dados"><LawDataAdmin law={law} /></div>;
}
