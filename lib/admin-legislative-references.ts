import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { referenceCandidatesFromQuestions, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";

export { referenceCandidatesFromQuestions, referencesNotYetStored, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";

const PAGE_SIZE = 50;

export type LegislativeReference = {
  id: string;
  leiId: number;
  slug: string;
  ordem: string;
  identification: string;
  legislation: string | null;
  preparedAt: string | null;
  updatedAt: string;
};

const text = (value: unknown, maximum = 20_000) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

function mapReference(row: Record<string, unknown>): LegislativeReference {
  return {
    id: String(row.id),
    leiId: Number(row.lei_id),
    slug: String(row.slug),
    ordem: String(row.ordem),
    identification: String(row.identificacao),
    legislation: row.legislacao ? String(row.legislacao) : null,
    preparedAt: row.preparado_em ? String(row.preparado_em) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function listLegislativeReferences(input: { lawSlug?: string; query?: string; page?: number; orderDirection?: "asc" | "desc" } = {}) {
  await exigirAdministrador();
  const lawSlug = text(input.lawSlug, 160).toLowerCase();
  const query = text(input.query, 120).replace(/[,%()]/g, " ");
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const offset = (page - 1) * PAGE_SIZE;
  const db = getSupabaseServerClient();
  let request = db.from("legislative_references")
    .select("id,lei_id,slug,ordem,identificacao,legislacao,preparado_em,updated_at")
    .order("ordem", { ascending: input.orderDirection !== "desc" })
    .range(offset, offset + PAGE_SIZE);
  if (lawSlug) request = request.eq("slug", lawSlug);
  if (query) request = request.or(`slug.ilike.%${query}%,ordem.ilike.%${query}%,identificacao.ilike.%${query}%`);
  const result = await request;
  if (result.error) throw new Error("Não foi possível carregar a base legislativa.");
  const records = (result.data ?? []).map((row) => mapReference(row as Record<string, unknown>));
  return { records: records.slice(0, PAGE_SIZE), page, hasNextPage: records.length > PAGE_SIZE };
}

export async function getLegislativeReference(slug: string, ordem: string) {
  await exigirAdministrador();
  const result = await getSupabaseServerClient().from("legislative_references")
    .select("id,lei_id,slug,ordem,identificacao,legislacao,preparado_em,updated_at")
    .eq("slug", slug.trim().toLowerCase())
    .eq("ordem", ordem.trim())
    .maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar a referência legislativa.");
  return result.data ? mapReference(result.data as Record<string, unknown>) : null;
}

/** Explicit, paginated discovery. It is never invoked while opening the Articles tab. */
export async function seedLegislativeReferences(lawSlug: string) {
  await exigirAdministrador();
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de identificar referências.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const lawRecord = law.data;

  let from = 0;
  const batch = 500;
  let inserted = 0;
  for (;;) {
    const questions = await db.from("questions").select("id,slug,ordem,assunto")
      .eq("ativo", true).eq("slug", slug).order("id").range(from, from + batch - 1);
    if (questions.error) throw new Error("Não foi possível identificar as referências das questões.");
    const candidates = referenceCandidatesFromQuestions((questions.data ?? []) as Array<{ id: string; slug: string; ordem: string; assunto: string | null }>);
    if (candidates.length) {
      const created = await db.from("legislative_references").upsert(
        candidates.map((item) => ({
          lei_id: lawRecord.id,
          slug,
          ordem: item.ordem,
          identificacao: item.identification,
          source_question_id: item.sourceQuestionId,
        })),
        { onConflict: "lei_id,ordem", ignoreDuplicates: true },
      );
      if (created.error) throw new Error("Não foi possível salvar as referências identificadas.");
      inserted += candidates.length;
    }
    if ((questions.data ?? []).length < batch) break;
    from += batch;
  }
  return { identified: inserted };
}

export async function saveLegislativeReference(input: { id: string; identification: unknown; legislation: unknown }) {
  await exigirAdministrador();
  const identification = text(input.identification, 500);
  const legislation = sanitizarHtmlLegislacao(text(input.legislation));
  if (!input.id.trim() || !identification) throw new Error("A identificação do dispositivo é obrigatória.");
  const result = await getSupabaseServerClient().from("legislative_references").update({
    identificacao: identification,
    legislacao: legislation || null,
    preparado_em: legislation ? new Date().toISOString() : null,
  }).eq("id", input.id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Não foi possível salvar a referência legislativa.");
}
