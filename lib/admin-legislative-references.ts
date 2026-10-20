import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { referenceCandidatesFromQuestions, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";
import { normalizedLegisBotLegislation } from "@/lib/legisbot/source";
import { legislativeDocumentParagraphs, parseLegislativeDocument } from "@/lib/legislative-document-import";
import { planLegislativeReferenceIdentifierRepair, type LegislativeReferenceIdentifierRepair } from "@/lib/legislative-reference-identifiers";
import { sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";

export { referenceCandidatesFromQuestions, referencesNotYetStored, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";

const PAGE_SIZE = 50;

export class LegislativeDocumentImportError extends Error {
  constructor(message: string, readonly technicalCode: string, readonly status = 400) {
    super(message);
    this.name = "LegislativeDocumentImportError";
  }
}

function inventoryImportError(error: { code?: unknown } | null) {
  const code = typeof error?.code === "string" && error.code ? error.code : "unknown";
  if (["42P01", "PGRST205"].includes(code)) {
    return new LegislativeDocumentImportError(`Inventário oficial indisponível neste ambiente (código ${code}): a tabela ainda não foi criada pela migration 20261019110000.`, code, 503);
  }
  if (code === "42501") {
    return new LegislativeDocumentImportError(`Inventário oficial sem permissão de gravação neste ambiente (código ${code}).`, code, 503);
  }
  if (["23502", "23505", "23514"].includes(code)) {
    return new LegislativeDocumentImportError(`Os dados do inventário foram recusados por uma restrição do banco (código ${code}).`, code, 409);
  }
  return new LegislativeDocumentImportError(`Não foi possível registrar o inventário oficial (código ${code}).`, code, 503);
}

export type LegislativeReference = {
  id: string;
  leiId: number;
  slug: string;
  ordem: string;
  identification: string;
  legislation: string | null;
  preparedAt: string | null;
  status: "pendente" | "preparada" | "revogada";
  revokingLaw: string | null;
  updatedAt: string;
};

const text = (value: unknown, maximum = 20_000) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

function mapReference(row: Record<string, unknown>, lawShortName?: string | null): LegislativeReference {
  return {
    id: String(row.id),
    leiId: Number(row.lei_id),
    slug: String(row.slug),
    ordem: String(row.ordem),
    // A identificação histórica pode ser apenas o parágrafo. A Central a
    // recompõe da mesma chave canônica das questões, sem gravar nada no banco.
    identification: formatLegalReferenceFromOrder(String(row.ordem), lawShortName) ?? String(row.identificacao),
    legislation: row.legislacao ? String(row.legislacao) : null,
    preparedAt: row.preparado_em ? String(row.preparado_em) : null,
    status: row.situacao === "revogada" ? "revogada" : row.situacao === "preparada" || Boolean(row.legislacao) ? "preparada" : "pendente",
    revokingLaw: row.lei_revogadora ? String(row.lei_revogadora) : null,
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
    .select("id,lei_id,slug,ordem,identificacao,legislacao,preparado_em,situacao,lei_revogadora,updated_at")
    .order("ordem", { ascending: input.orderDirection !== "desc" })
    .range(offset, offset + PAGE_SIZE);
  if (lawSlug) request = request.eq("slug", lawSlug);
  if (query) request = request.or(`slug.ilike.%${query}%,ordem.ilike.%${query}%,identificacao.ilike.%${query}%`);
  const result = await request;
  if (result.error) throw new Error("Não foi possível carregar a base legislativa.");
  const rows = (result.data ?? []) as Record<string, unknown>[];
  const lawIds = [...new Set(rows.map((row) => Number(row.lei_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  const laws = lawIds.length
    ? await db.from("leis").select("id,nome_curto").in("id", lawIds)
    : { data: [], error: null };
  if (laws.error) throw new Error("Não foi possível carregar os nomes curtos das legislações.");
  const shortNameByLawId = new Map((laws.data ?? []).map((law) => [Number(law.id), law.nome_curto ? String(law.nome_curto) : null]));
  const records = rows.map((row) => mapReference(row, shortNameByLawId.get(Number(row.lei_id))));
  return { records: records.slice(0, PAGE_SIZE), page, hasNextPage: records.length > PAGE_SIZE };
}

export async function getLegislativeReference(slug: string, ordem: string) {
  await exigirAdministrador();
  const result = await getSupabaseServerClient().from("legislative_references")
    .select("id,lei_id,slug,ordem,identificacao,legislacao,preparado_em,situacao,lei_revogadora,updated_at")
    .eq("slug", slug.trim().toLowerCase())
    .eq("ordem", ordem.trim())
    .maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar a referência legislativa.");
  return result.data ? mapReference(result.data as Record<string, unknown>) : null;
}

/** Read-only preview. The actual repair only prefixes missing Art./§ labels. */
export async function previewLegislativeReferenceIdentifierRepair(lawSlug: string) {
  await exigirAdministrador();
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de revisar identificadores.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const result = await db.from("legislative_references")
    .select("id,ordem,identificacao,legislacao,updated_at")
    .eq("lei_id", law.data.id).eq("slug", slug).not("legislacao", "is", null).order("ordem");
  if (result.error) throw new Error("Não foi possível revisar a base legislativa.");
  const repairs = (result.data ?? []).flatMap((row) => {
    const repair = planLegislativeReferenceIdentifierRepair({
      id: String(row.id), ordem: String(row.ordem), identification: String(row.identificacao),
      legislation: row.legislacao ? String(row.legislacao) : null, updatedAt: String(row.updated_at),
    });
    return repair ? [repair] : [];
  });
  return { slug, lawId: Number(law.data.id), repairs };
}

/**
 * Creates one immutable backup per repaired reference, then updates only a row
 * that still has the exact revision shown in the preview. A second run is a no-op.
 */
export async function repairLegislativeReferenceIdentifiers(input: { lawSlug: string; expected: Array<{ id: string; updatedAt: string }> }) {
  const user = await exigirAdministrador();
  const preview = await previewLegislativeReferenceIdentifierRepair(input.lawSlug);
  const expected = new Map((Array.isArray(input.expected) ? input.expected : []).map((item) => [String(item.id), String(item.updatedAt)]));
  if (!expected.size) throw new Error("Gere a prévia antes de confirmar o reparo.");
  const db = getSupabaseServerClient();
  let repaired = 0;
  let skipped = 0;
  for (const repair of preview.repairs as LegislativeReferenceIdentifierRepair[]) {
    if (expected.get(repair.id) !== repair.updatedAt) { skipped += 1; continue; }
    const backup = await db.from("legislative_reference_identifier_repairs").insert({
      reference_id: repair.id,
      lei_id: preview.lawId,
      slug: preview.slug, ordem: repair.ordem, identificacao: repair.identification,
      legislacao_anterior: repair.legislation, legislacao_reparada: repair.repairedLegislation,
      repaired_by: user.id,
    });
    if (backup.error) {
      if (backup.error.code === "23505") { skipped += 1; continue; }
      throw new Error("Não foi possível criar o backup do reparo.");
    }
    const updated = await db.from("legislative_references").update({ legislacao: repair.repairedLegislation })
      .eq("id", repair.id).eq("updated_at", repair.updatedAt).select("id").maybeSingle();
    if (updated.error) throw new Error("Não foi possível aplicar o reparo na base legislativa.");
    if (updated.data) repaired += 1; else skipped += 1;
  }
  return { repaired, skipped, found: preview.repairs.length };
}

/** Explicit, paginated discovery. It is never invoked while opening the Articles tab. */
export async function seedLegislativeReferences(lawSlug: string) {
  await exigirAdministrador();
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de identificar referências.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  // Descoberta por questão não cria mais referências vazias. Um bloco só nasce
  // quando a importação dispõe do texto legal correspondente.
  return { identified: 0 };
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
  // A amostra é apenas de leitura: o HTML vem do parser e é sanitizado no
  // servidor antes de seguir para o componente administrativo.
  return {
    ...preview,
    sample: preview.references.slice(0, 20).map((reference) => ({
      ...reference,
      displayLegislation: sanitizeLegalHtmlCore(reference.legislation),
    })),
  };
}

export async function importLegislativeDocument(input: { lawSlug: string; name: string; bytes: Uint8Array; expected: unknown }) {
  await exigirAdministrador();
  const preview = await documentImportPreview(input.lawSlug, input.name, input.bytes);
  const expected = Array.isArray(input.expected) ? input.expected : [];
  const current = preview.references.map(({ ordem, identification, legislation, operation }) => ({ ordem, identification, legislation, operation }));
  if (JSON.stringify(expected) !== JSON.stringify(current)) throw new Error("O documento ou a base mudaram desde a prévia. Gere uma nova prévia.");
  const db = getSupabaseServerClient();
  const inventory = await db.from("legislative_reference_inventory").upsert(preview.references.map((reference) => ({
    lei_id: preview.lawId,
    slug: preview.slug,
    ordem: reference.ordem,
    identificacao: reference.identification,
    legislacao: reference.legislation,
    document_name: text(input.name, 500),
    imported_at: new Date().toISOString(),
  })), { onConflict: "lei_id,ordem" });
  if (inventory.error) throw inventoryImportError(inventory.error);
  let created = 0; let filled = 0; let preserved = 0;
  for (const reference of preview.references) {
    if (reference.operation === "preservar") { preserved += 1; continue; }
    if (reference.operation === "criar") {
      const inserted = await db.from("legislative_references").insert({ lei_id: preview.lawId, slug: preview.slug, ordem: reference.ordem, identificacao: reference.identification, legislacao: reference.legislation, preparado_em: new Date().toISOString(), situacao: "preparada" }).select("id").maybeSingle();
      if (inserted.error || !inserted.data) throw new Error("Não foi possível criar uma referência do documento.");
      created += 1;
    } else {
      const updated = await db.from("legislative_references").update({ legislacao: reference.legislation, preparado_em: new Date().toISOString(), situacao: "preparada", lei_revogadora: null, revogado_em: null }).eq("lei_id", preview.lawId).eq("ordem", reference.ordem).is("legislacao", null).select("id").maybeSingle();
      if (updated.error) throw new Error("Não foi possível preencher uma referência do documento.");
      if (updated.data) filled += 1; else preserved += 1;
    }
  }
  return { created, filled, preserved, rejected: preview.rejected.length };
}

/** Resolve an official-inventory gap without ever manufacturing an empty block. */
export async function resolveLegislativeReferenceShadow(input: { lawSlug: string; ordem: unknown; resolution: unknown; revokingLaw?: unknown }) {
  await exigirAdministrador();
  const slug = text(input.lawSlug, 160).toLowerCase();
  const ordem = text(input.ordem, 100);
  const resolution = input.resolution === "revogada" ? "revogada" : "preparada";
  const revokingLaw = text(input.revokingLaw, 500);
  if (!slug || !ordem) throw new Error("Identificação do artigo sombra inválida.");
  if (resolution === "revogada" && !revokingLaw) throw new Error("Informe a lei que revogou este dispositivo.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const inventory = await db.from("legislative_reference_inventory")
    .select("ordem,identificacao,legislacao").eq("lei_id", law.data.id).eq("ordem", ordem).maybeSingle();
  if (inventory.error || !inventory.data) throw new Error("O dispositivo não consta no inventário oficial da lei.");
  const source = inventory.data as { ordem: string; identificacao: string; legislacao: string };
  if (!source.legislacao.trim()) throw new Error("O inventário oficial não contém o texto deste dispositivo.");
  const existing = await db.from("legislative_references").select("id,legislacao").eq("lei_id", law.data.id).eq("ordem", ordem).maybeSingle();
  if (existing.error) throw new Error("Não foi possível verificar a base legislativa.");
  if (existing.data?.legislacao?.trim()) throw new Error("Este dispositivo já possui texto preparado na base legislativa.");
  const payload = {
    identificacao: source.identificacao,
    legislacao: source.legislacao,
    preparado_em: new Date().toISOString(),
    situacao: resolution,
    lei_revogadora: resolution === "revogada" ? revokingLaw : null,
    revogado_em: resolution === "revogada" ? new Date().toISOString() : null,
  };
  if (existing.data) {
    const updated = await db.from("legislative_references").update(payload).eq("id", existing.data.id).select("id").maybeSingle();
    if (updated.error || !updated.data) throw new Error("Não foi possível resolver o artigo sombra.");
  } else {
    const inserted = await db.from("legislative_references").insert({ lei_id: law.data.id, slug, ordem, ...payload }).select("id").maybeSingle();
    if (inserted.error || !inserted.data) throw new Error("Não foi possível criar o bloco legislativo.");
  }
  return { resolution };
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
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const references = await db.from("legislative_references")
    .select("id,ordem,legislacao")
    .eq("slug", slug);
  if (references.error) throw new Error("Não foi possível carregar a base legislativa.");
  const existingByOrder = new Map((references.data ?? []).map((reference) => [String(reference.ordem), { id: String(reference.id), hasLegislation: Boolean(typeof reference.legislacao === "string" && reference.legislacao.trim()) }]));
  const versionsByOrder = new Map<string, Map<string, string>>();
  const questionCandidates: Array<{ id: string; slug: string; ordem: string; assunto: string | null }> = [];
  let from = 0;
  const batch = 500;
  for (;;) {
    const questions = await db.from("questions").select("id,slug,ordem,assunto,legislacao")
      .eq("ativo", true).eq("slug", slug).order("id").range(from, from + batch - 1);
    if (questions.error) throw new Error("Não foi possível carregar os recortes das questões.");
    for (const question of questions.data ?? []) {
      const ordem = String(question.ordem ?? "").trim();
      const legislation = sanitizarHtmlLegislacao(String(question.legislacao ?? "")).trim();
      const fingerprint = normalizedLegisBotLegislation(legislation);
      if (!fingerprint) continue;
      questionCandidates.push({ id: String(question.id), slug: String(question.slug), ordem, assunto: question.assunto ? String(question.assunto) : null });
      const versions = versionsByOrder.get(ordem) ?? new Map<string, string>();
      if (!versions.has(fingerprint)) versions.set(fingerprint, legislation);
      versionsByOrder.set(ordem, versions);
    }
    if ((questions.data ?? []).length < batch) break;
    from += batch;
  }

  let imported = 0;
  let skippedConflicts = 0;
  let skippedEmpty = 0;
  let skippedExisting = 0;
  const now = new Date().toISOString();
  const candidatesByOrder = new Map(referenceCandidatesFromQuestions(questionCandidates).map((candidate) => [candidate.ordem, candidate]));
  for (const [ordem, versions] of versionsByOrder) {
    const existing = existingByOrder.get(ordem);
    if (existing?.hasLegislation) { skippedExisting += 1; continue; }
    if (!versions?.size) { skippedEmpty += 1; continue; }
    if (versions.size !== 1) { skippedConflicts += 1; continue; }
    const legislation = [...versions.values()][0];
    if (existing) {
      const saved = await db.from("legislative_references").update({ legislacao: legislation, preparado_em: now, situacao: "preparada", lei_revogadora: null, revogado_em: null })
        .eq("id", existing.id).is("legislacao", null).select("id").maybeSingle();
      if (saved.error) throw new Error("Não foi possível importar um dos recortes legislativos.");
      if (saved.data) imported += 1;
      continue;
    }
    const candidate = candidatesByOrder.get(ordem);
    if (!candidate) { skippedEmpty += 1; continue; }
    const created = await db.from("legislative_references").insert({ lei_id: law.data.id, slug, ordem, identificacao: candidate.identification, source_question_id: candidate.sourceQuestionId, legislacao: legislation, preparado_em: now, situacao: "preparada" }).select("id").maybeSingle();
    if (created.error || !created.data) throw new Error("Não foi possível criar uma referência legislativa a partir do texto da questão.");
    imported += 1;
  }
  return { imported, skippedExisting, skippedConflicts, skippedEmpty };
}

export async function saveLegislativeReference(input: { id: string; identification: unknown; legislation: unknown; status?: unknown; revokingLaw?: unknown }) {
  await exigirAdministrador();
  const identification = text(input.identification, 500);
  const legislation = sanitizarHtmlLegislacao(text(input.legislation));
  if (!input.id.trim() || !identification) throw new Error("A identificação do dispositivo é obrigatória.");
  if (!legislation) throw new Error("O texto legislativo é obrigatório; não são permitidos blocos vazios.");
  const status = input.status === "revogada" ? "revogada" : "preparada";
  const revokingLaw = text(input.revokingLaw, 500);
  if (status === "revogada" && !revokingLaw) throw new Error("Informe a lei que revogou este dispositivo antes de salvar.");
  const result = await getSupabaseServerClient().from("legislative_references").update({
    identificacao: identification,
    legislacao: legislation || null,
    preparado_em: legislation ? new Date().toISOString() : null,
    situacao: status,
    lei_revogadora: status === "revogada" ? revokingLaw : null,
    revogado_em: status === "revogada" ? new Date().toISOString() : null,
  }).eq("id", input.id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Não foi possível salvar a referência legislativa.");
}

/** Creates the one canonical reference for an already identified question context. */
export async function createLegislativeReferenceFromPreview(input: { lawSlug: string; ordem: unknown; identification: unknown }) {
  void input;
  throw new Error("Não é permitido criar bloco legislativo vazio. Importe ou cadastre primeiro o texto legal.");
}
