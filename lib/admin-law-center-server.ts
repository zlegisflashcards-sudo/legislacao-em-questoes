import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AdminLaw = Record<string, unknown> & { id: number; slug: string; titulo: string; ativo: boolean; status_publicacao: "ativa" | "em_breve" | "inativa" };

async function requireAdmin() {
  if (!await obterAdministrador()) throw new Error("Autenticação administrativa obrigatória.");
}

export async function listAdminLawCenterLaws(query = "") {
  await requireAdmin();
  const db = getSupabaseServerClient();
  let request = db.from("leis").select("id,slug,titulo,nome_curto,codigo,categoria,ativo,status_publicacao,ordem");
  const normalized = query.trim().slice(0, 120).replace(/[%_,()]/g, " ").replace(/\s+/g, " ");
  if (normalized) request = request.or(`slug.ilike.%${normalized}%,titulo.ilike.%${normalized}%,nome_curto.ilike.%${normalized}%,codigo.ilike.%${normalized}%`);
  const result = await request.order("ordem").order("titulo").limit(100);
  if (result.error) throw new Error("Não foi possível carregar as leis.");
  return (result.data ?? []) as AdminLaw[];
}

export async function getAdminLawBySlug(slug: string) {
  await requireAdmin();
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  const result = await getSupabaseServerClient().from("leis").select("*").eq("slug", slug).maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar a lei.");
  return result.data as AdminLaw | null;
}

export async function getAdminLawOverview(lawId: number) {
  await requireAdmin();
  const db = getSupabaseServerClient();
  const resources = [
    ["structure", db.from("law_structure").select("id", { count: "exact", head: true }).eq("lei_id", lawId).eq("ativo", true)],
    ["questions", db.from("questions").select("id", { count: "exact", head: true }).eq("lei_id", lawId).eq("ativo", true)],
    ["scopes", db.from("recortes_leis").select("id", { count: "exact", head: true }).eq("lei_id", lawId).eq("ativo", true)],
    ["audios", db.from("legiscast_audios").select("id", { count: "exact", head: true }).eq("lei_id", lawId).eq("ativo", true)],
    ["materials", db.from("materiais_leis").select("id", { count: "exact", head: true }).eq("lei_id", lawId).eq("ativo", true)],
  ] as const;
  const results = await Promise.all(resources.map(([, request]) => request));
  if (results.some((result) => result.error)) throw new Error("Não foi possível carregar o resumo da lei.");
  return Object.fromEntries(resources.map(([key], index) => [key, results[index].count ?? 0])) as Record<(typeof resources)[number][0], number>;
}

export async function getAdminLawOverviewChecks(lawId: number) {
  await requireAdmin();
  const result = await getSupabaseServerClient().from("admin_law_overview_checks").select("item").eq("lei_id", lawId);
  if (result.error) throw new Error("Não foi possível carregar as marcações administrativas.");
  return (result.data ?? []).map((row) => String(row.item)).filter((item): item is "estrutura" | "materiais" | "legiscast" | "anki" => ["estrutura", "materiais", "legiscast", "anki"].includes(item));
}

export async function getAdminLawStructure(lawId: number) {
  await requireAdmin();
  const result = await getSupabaseServerClient().from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,pdf_page,ativo").eq("lei_id", lawId).eq("ativo", true).order("ordem").order("id");
  if (result.error) throw new Error("Não foi possível carregar a estrutura da lei.");
  return result.data ?? [];
}
