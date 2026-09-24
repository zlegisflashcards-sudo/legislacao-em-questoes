import { redirect } from "next/navigation";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export default async function AdminQuestoesPage({ searchParams }: { searchParams: Promise<{ law_slug?: string }> }) {
  await exigirAdministrador();
  const lawSlug = (await searchParams).law_slug;
  redirect(lawSlug ? `/admin/leis/${encodeURIComponent(lawSlug)}/questoes` : "/admin/leis");
}
