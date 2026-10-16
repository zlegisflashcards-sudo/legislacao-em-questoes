import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { referenceCandidatesFromQuestions, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";
import { normalizedLegisBotLegislation } from "@/lib/legisbot/source";
import { legislativeDocumentParagraphs, parseLegislativeDocument } from "@/lib/legislative-document-import";

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

/**
 * Reinicia somente a base editorial da lei. Questões e LegisBots são
 * independentes desses registros e permanecem intactos para uma nova identificação.
 */
export async function clearLegislativeReferences(lawSlug: string) {
  const user = await exigirAdministrador();
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de limpar a base.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const existing = await db.from("legislative_references").select("id", { count: "exact", head: true }).eq("lei_id", law.data.id).eq("slug", slug);
  if (existing.error) throw new Error("Não foi possível verificar a base legislativa.");
  const removed = await db.from("legislative_references").delete().eq("lei_id", law.data.id).eq("slug", slug);
  if (removed.error) throw new Error("Não foi possível limpar a base legislativa.");
  const audit = await db.rpc("admin_comercial_auditar", {
    p_ator_user_id: user.id, p_acao: "excluir", p_entidade: "base_legislativa", p_entidade_id: String(law.data.id),
    p_anterior: { slug, referencias: existing.count ?? 0 }, p_posterior: {},
    p_detalhes: { origem: "central_artigo_limpar_referencias", preservados: ["questions", "legisbot_comentarios"] },
  });
  if (audit.error) console.error("Falha ao auditar limpeza da base legislativa", { slug, code: audit.error.code });
  return { removed: existing.count ?? 0 };
}

async function documentImportPreview(lawSlug: string, name: string, bytes: Uint8Array) {
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de importar o documento.");
  const parsed = parseLegislativeDocument(legislativeDocumentParagraphs(name, bytes));
  if (!parsed.references.length) throw new Error("Nenhuma referência estrutural foi encontrada no documento.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const stored = await db.from("legislative_references").select("ordem,legislacao").eq("lei_id", law.data.id).in("ordem", parsed.references.map((reference) => reference.ordem));
  if (stored.error) throw new Error("Não foi possível verificar a base legislativa.");
  const existing = new Map((stored.data ?? []).map((row) => [String(row.ordem), typeof row.legislacao === "string" && row.legislacao.trim().length > 0]));
  const candidates = parsed.references.map((reference) => ({ ...reference, operation: existing.has(reference.ordem) ? existing.get(reference.ordem) ? "preservar" as const : "preencher" as const : "criar" as const }));
  return { slug, lawId: Number(law.data.id), references: candidates, rejected: parsed.rejected };
}

export async function previewLegislativeDocumentImport(input: { lawSlug: string; name: string; bytes: Uint8Array }) {
  await exigirAdministrador();
  const preview = await documentImportPreview(input.lawSlug, input.name, input.bytes);
  return { ...preview, sample: preview.references.slice(0, 20) };
}

export async function importLegislativeDocument(input: { lawSlug: string; name: string; bytes: Uint8Array; expected: unknown }) {
  await exigirAdministrador();
  const preview = await documentImportPreview(input.lawSlug, input.name, input.bytes);
  const expected = Array.isArray(input.expected) ? input.expected : [];
  const current = preview.references.map(({ ordem, identification, legislation, operation }) => ({ ordem, identification, legislation, operation }));
  if (JSON.stringify(expected) !== JSON.stringify(current)) throw new Error("O documento ou a base mudaram desde a prévia. Gere uma nova prévia.");
  const db = getSupabaseServerClient();
  let created = 0; let filled = 0; let preserved = 0;
  for (const reference of preview.references) {
    if (reference.operation === "preservar") { preserved += 1; continue; }
    if (reference.operation === "criar") {
      const inserted = await db.from("legislative_references").insert({ lei_id: preview.lawId, slug: preview.slug, ordem: reference.ordem, identificacao: reference.identification, legislacao: reference.legislation, preparado_em: new Date().toISOString() }).select("id").maybeSingle();
      if (inserted.error || !inserted.data) throw new Error("Não foi possível criar uma referência do documento.");
      created += 1;
    } else {
      const updated = await db.from("legislative_references").update({ legislacao: reference.legislation, preparado_em: new Date().toISOString() }).eq("lei_id", preview.lawId).eq("ordem", reference.ordem).is("legislacao", null).select("id").maybeSingle();
      if (updated.error) throw new Error("Não foi possível preencher uma referência do documento.");
      if (updated.data) filled += 1; else preserved += 1;
    }
  }
  return { created, filled, preserved, rejected: preview.rejected.length };
}

/**
 * Importação editorial explícita: preenche somente referências ainda vazias.
 * Em caso de mais de uma legislação materialmente diferente para a mesma Ordem,
 * não escolhe uma delas automaticamente.
 */
export async function importQuestionLegislationToReferences(lawSlug: string) {
  await exigirAdministrador();
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de importar os recortes.");
  await seedLegislativeReferences(slug);
  const db = getSupabaseServerClient();
  const references = await db.from("legislative_references")
    .select("id,ordem,legislacao")
    .eq("slug", slug);
  if (references.error) throw new Error("Não foi possível carregar a base legislativa.");
  const emptyByOrder = new Map((references.data ?? []).flatMap((reference) => {
    const legislation = typeof reference.legislacao === "string" ? reference.legislacao.trim() : "";
    return legislation ? [] : [[String(reference.ordem), String(reference.id)] as const];
  }));
  if (!emptyByOrder.size) return { imported: 0, skippedExisting: (references.data ?? []).length, skippedConflicts: 0, skippedEmpty: 0 };

  const candidates = new Map<string, Map<string, string>>();
  let from = 0;
  const batch = 500;
  for (;;) {
    const questions = await db.from("questions").select("ordem,legislacao")
      .eq("ativo", true).eq("slug", slug).order("id").range(from, from + batch - 1);
    if (questions.error) throw new Error("Não foi possível carregar os recortes das questões.");
    for (const question of questions.data ?? []) {
      const ordem = String(question.ordem ?? "").trim();
      if (!emptyByOrder.has(ordem)) continue;
      const legislation = sanitizarHtmlLegislacao(String(question.legislacao ?? "")).trim();
      const fingerprint = normalizedLegisBotLegislation(legislation);
      if (!fingerprint) continue;
      const versions = candidates.get(ordem) ?? new Map<string, string>();
      if (!versions.has(fingerprint)) versions.set(fingerprint, legislation);
      candidates.set(ordem, versions);
    }
    if ((questions.data ?? []).length < batch) break;
    from += batch;
  }

  let imported = 0;
  let skippedConflicts = 0;
  let skippedEmpty = 0;
  const now = new Date().toISOString();
  for (const [ordem, referenceId] of emptyByOrder) {
    const versions = candidates.get(ordem);
    if (!versions?.size) { skippedEmpty += 1; continue; }
    if (versions.size !== 1) { skippedConflicts += 1; continue; }
    const legislation = [...versions.values()][0];
    const saved = await db.from("legislative_references").update({ legislacao: legislation, preparado_em: now })
      .eq("id", referenceId).is("legislacao", null).select("id").maybeSingle();
    if (saved.error) throw new Error("Não foi possível importar um dos recortes legislativos.");
    if (saved.data) imported += 1;
  }
  return { imported, skippedExisting: (references.data ?? []).length - emptyByOrder.size, skippedConflicts, skippedEmpty };
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
