import "server-only";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AdminArticleConflictError } from "@/lib/admin-article-conflicts-server";
import { DUPLICATE_CLEANUP_CONFIRMATION, DUPLICATE_CLEANUP_FIELDS, planLawDuplicateCleanup, type DuplicateCleanupRow } from "@/lib/admin-law-duplicate-cleanup";

async function prepare(rawLaw: unknown) {
  const user = await obterAdministrador();
  if (!user) throw new AdminArticleConflictError(401, "Autenticação administrativa obrigatória.");
  const slug = typeof rawLaw === "string" ? rawLaw.trim().toLowerCase() : "";
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) throw new AdminArticleConflictError(400, "Escolha um baralho antes de revisar suas duplicatas.", "law_required");
  const db = getSupabaseServerClient();
  const result = await db.from("leis").select("id,slug,titulo").eq("slug", slug).eq("ativo", true).maybeSingle();
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar o baralho.");
  if (!result.data) throw new AdminArticleConflictError(404, "Baralho ativo não encontrado.");
  const law = { id: Number(result.data.id), slug: String(result.data.slug), title: String(result.data.titulo) };
  const rows: DuplicateCleanupRow[] = [];
  // Fetch ALL pages, independently of the current conflicts UI filters/page.
  for (let from = 0; ; from += 1000) {
    const page = await db.from("questions").select(DUPLICATE_CLEANUP_FIELDS).eq("lei_id", law.id).eq("slug", law.slug).eq("ativo", true).order("id").range(from, from + 999);
    if (page.error) throw new AdminArticleConflictError(503, "Não foi possível consultar todas as questões do baralho.");
    rows.push(...(page.data ?? []) as DuplicateCleanupRow[]);
    if ((page.data?.length ?? 0) < 1000) break;
  }
  return { user, db, law, ...planLawDuplicateCleanup(rows, law.id, law.slug) };
}

export async function previewLawDuplicateCleanup(law: unknown) {
  const prepared = await prepare(law);
  return {
    law: prepared.law.slug, title: prepared.law.title, token: prepared.token,
    groups: prepared.groups, total: prepared.total, activeCount: prepared.snapshot.length,
    reversible: true,
  };
}

export async function applyLawDuplicateCleanup(input: { law: unknown; token: unknown; confirmation: unknown }) {
  const prepared = await prepare(input.law);
  if (input.confirmation !== DUPLICATE_CLEANUP_CONFIRMATION) throw new AdminArticleConflictError(422, `Digite ${DUPLICATE_CLEANUP_CONFIRMATION} para confirmar.`, "duplicate_confirmation_required");
  if (typeof input.token !== "string" || input.token !== prepared.token) throw new AdminArticleConflictError(409, "O baralho mudou desde a prévia ou este lote já foi aplicado. Gere uma nova prévia.", "duplicate_preview_stale");
  if (!prepared.total) return { applied: 0, groups: 0, reversible: true };
  const result = await prepared.db.rpc("admin_deactivate_law_duplicate_questions", {
    p_lei_id: prepared.law.id, p_slug: prepared.law.slug,
    p_expected: prepared.snapshot,
    p_groups: prepared.groups.map((group) => ({ retained_id: group.retained.id, candidate_ids: group.candidates.map((row) => row.id) })),
    p_actor_user_id: prepared.user.id,
  });
  if (result.error) {
    if (result.error.code === "40001") throw new AdminArticleConflictError(409, "O baralho mudou durante a confirmação. Nenhuma questão deste lote foi inativada. Gere outra prévia.", "duplicate_preview_stale");
    if (["PGRST202", "42883"].includes(result.error.code ?? "")) throw new AdminArticleConflictError(503, "A limpeza de todas as duplicatas ainda não está habilitada no banco. Nenhuma questão foi alterada.", "duplicate_cleanup_not_installed");
    // A timeout/network error may be a committed response that was lost. Never
    // claim rollback or retry automatically when the result is uncertain.
    throw new Error("Não foi possível confirmar o resultado da limpeza. Atualize os conflitos e confira o histórico antes de tentar novamente.");
  }
  return result.data as { applied: number; groups: number; reversible: true };
}
