import { notFound } from "next/navigation";
import LegisBotEditor from "@/components/admin/legisbot-editor";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";

export const dynamic = "force-dynamic";

export default async function AdminLegisBotDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  await exigirAdministrador();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^\d+$/.test(id)) notFound();
  const { data, error } = await getSupabaseServerClient().from("legisbot_comentarios").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  return <main className="admin-shell">{query.erro ? <div className="admin-alert error">Não foi possível excluir o registro.</div> : null}<LegisBotEditor record={data as LegisBotComentario} /></main>;
}
