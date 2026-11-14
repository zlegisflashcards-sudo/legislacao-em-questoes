import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { possuiTextoLegislacao, sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { referenceCandidatesFromQuestions, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";
import { normalizedLegisBotLegislation } from "@/lib/legisbot/source";
import { canonicalStructureName, legislativeDocumentParagraphs, parseLegislativeDocument } from "@/lib/legislative-document-import";
import { planLegislativeReferenceIdentifierRepair, type LegislativeReferenceIdentifierRepair } from "@/lib/legislative-reference-identifiers";
import { sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";
import { detectManualLegislativeReference, isCanonicalManualReferenceOrder, preserveManualLegislationLineBreaks } from "@/lib/manual-legislative-reference";

export { referenceCandidatesFromQuestions, referencesNotYetStored, type LegislativeReferenceCandidate } from "@/lib/legislative-reference-candidates";

const PAGE_SIZE = 50;

export class LegislativeDocumentImportError extends Error {
  constructor(message: string, readonly technicalCode: string, readonly status = 400) {
    super(message);
    this.name = "LegislativeDocumentImportError";
  }
}

function inventoryImportError(error: { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null) {
  const code = typeof error?.code === "string" && error.code ? error.code : "unknown";
  const category = ["42P01", "PGRST205"].includes(code)
    ? "inventario_indisponivel"
    : code === "42501"
      ? "permissao"
      : ["23502", "23505", "23514"].includes(code)
        ? "restricao"
        : "falha_do_inventario";
  // Não expõe detalhes do banco ao navegador; os sinais abaixo bastam para a
  // triagem administrativa e não incluem valores, SQL ou dados pessoais.
  console.error("[Importação legislativa] falha no inventário", {
    code,
    category,
    hasMessage: typeof error?.message === "string" && error.message.length > 0,
    hasDetails: typeof error?.details === "string" && error.details.length > 0,
    hasHint: typeof error?.hint === "string" && error.hint.length > 0,
  });
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
  storedIdentification: string;
  legislation: string | null;
  preparedAt: string | null;
  status: "pendente" | "preparada" | "revogada";
  revokingLaw: string | null;
  structureId: number | null;
  updatedAt: string;
};

export type ManualLegislativeReferencePreview = {
  lawId: number;
  slug: string;
  identification: string;
  ordem: string;
  legislation: string;
  detectionWarning: string | null;
  validationError: string | null;
  existing: { id: string; identification: string; legislation: string | null } | null;
};

const text = (value: unknown, maximum = 20_000) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

function stableManualPreview(preview: ManualLegislativeReferencePreview) {
  return {
    lawId: preview.lawId,
    slug: preview.slug,
    identification: preview.identification,
    ordem: preview.ordem,
    legislation: preview.legislation,
  };
}

/**
 * Read-only analysis for the unitary “Adicionar bloco” flow.  It is kept
 * separate from document import because a pasted study excerpt is not a
 * reliable multi-device source document.
 */
export async function previewManualLegislativeReference(input: { lawSlug: unknown; legislation: unknown; identification?: unknown; ordem?: unknown }): Promise<ManualLegislativeReferencePreview> {
  await exigirAdministrador();
  const slug = text(input.lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de adicionar o bloco.");
  const rawLegislation = text(input.legislation, 40_000);
  const legislation = sanitizarHtmlLegislacao(preserveManualLegislationLineBreaks(rawLegislation));
  if (!possuiTextoLegislacao(legislation)) throw new Error("Cole o texto legislativo do dispositivo.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug,nome_curto").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const detected = detectManualLegislativeReference(rawLegislation, law.data.nome_curto ? String(law.data.nome_curto) : null);
  const identification = text(input.identification, 500) || detected.suggestion?.identification || "";
  const ordem = text(input.ordem, 100) || detected.suggestion?.ordem || "";
  const validationError = !identification || !ordem
    ? "Revise e informe Assunto e Ordem antes de salvar."
    : !isCanonicalManualReferenceOrder(ordem)
      ? "A Ordem deve seguir o padrão artigo.letra.parágrafo.letra.inciso.letra."
      : null;
  const existing = validationError
    ? { data: null, error: null }
    : await db.from("legislative_references").select("id,identificacao,legislacao").eq("lei_id", law.data.id).eq("ordem", ordem).or("situacao.is.null,situacao.neq.arquivada").maybeSingle();
  if (existing.error) throw new Error("Não foi possível verificar se já existe um bloco nessa Ordem.");
  return {
    lawId: Number(law.data.id), slug, identification, ordem, legislation,
    detectionWarning: detected.warning,
    validationError,
    existing: existing.data ? {
      id: String(existing.data.id), identification: String(existing.data.identificacao),
      legislation: existing.data.legislacao ? String(existing.data.legislacao) : null,
    } : null,
  };
}

/** Creates exactly one new canonical legislative block and never overwrites one. */
export async function createManualLegislativeReference(input: { lawSlug: unknown; legislation: unknown; identification: unknown; ordem: unknown; expected: unknown }) {
  await exigirAdministrador();
  const preview = await previewManualLegislativeReference(input);
  if (preview.validationError) throw new Error(preview.validationError);
  const expected = input.expected && typeof input.expected === "object" ? input.expected : null;
  if (JSON.stringify(expected) !== JSON.stringify(stableManualPreview(preview))) {
    throw new Error("O texto ou os dados do bloco mudaram desde a prévia. Revise e gere uma nova prévia.");
  }
  if (preview.existing) throw new Error("Já existe um bloco nesta lei e Ordem. Abra o bloco atual para compará-lo; ele não foi alterado.");
  const db = getSupabaseServerClient();
  const inserted = await db.from("legislative_references").insert({
    lei_id: preview.lawId,
    slug: preview.slug,
    ordem: preview.ordem,
    identificacao: preview.identification,
    legislacao: preview.legislation,
    preparado_em: new Date().toISOString(),
    situacao: "preparada",
  }).select("id").maybeSingle();
  if (inserted.error?.code === "23505") throw new Error("Já existe um bloco nesta lei e Ordem. Abra o bloco atual para compará-lo; ele não foi alterado.");
  if (inserted.error || !inserted.data) throw new Error("Não foi possível criar o bloco legislativo.");
  return { id: String(inserted.data.id), slug: preview.slug, ordem: preview.ordem };
}

function mapReference(row: Record<string, unknown>, lawShortName?: string | null): LegislativeReference {
  return {
    id: String(row.id),
    leiId: Number(row.lei_id),
    slug: String(row.slug),
    ordem: String(row.ordem),
    // A identificação histórica pode ser apenas o parágrafo. A Central a
    // recompõe da mesma chave canônica das questões, sem gravar nada no banco.
    identification: formatLegalReferenceFromOrder(String(row.ordem), lawShortName, typeof row.identificacao === "string" ? row.identificacao : null) ?? String(row.identificacao),
    storedIdentification: String(row.identificacao ?? ""),
    legislation: row.legislacao ? String(row.legislacao) : null,
    preparedAt: row.preparado_em ? String(row.preparado_em) : null,
    status: row.situacao === "revogada" ? "revogada" : row.situacao === "preparada" || Boolean(row.legislacao) ? "preparada" : "pendente",
    revokingLaw: row.lei_revogadora ? String(row.lei_revogadora) : null,
    structureId: typeof row.structure_id === "number" && Number.isInteger(row.structure_id) ? row.structure_id : null,
    updatedAt: String(row.updated_at),
  };
}

/**
 * Lists the persisted legislative base with every filter applied in Postgres
 * before the page window is selected. `unassigned` intentionally means a
 * null editorial structure link; it is not inferred from questions.
 */
export async function listLegislativeReferences(input: {
  lawSlug?: string;
  query?: string;
  page?: number;
  orderDirection?: "asc" | "desc";
  structureFilter?: number | "unassigned";
} = {}) {
  await exigirAdministrador();
  const lawSlug = text(input.lawSlug, 160).toLowerCase();
  const query = text(input.query, 120).replace(/[,%()]/g, " ");
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const offset = (page - 1) * PAGE_SIZE;
  const db = getSupabaseServerClient();
  let request = db.from("legislative_references")
    .select("id,lei_id,slug,ordem,identificacao,legislacao,preparado_em,situacao,lei_revogadora,structure_id,updated_at")
    .or("situacao.is.null,situacao.neq.arquivada")
    .order("ordem", { ascending: input.orderDirection !== "desc" })
    .range(offset, offset + PAGE_SIZE);
  if (lawSlug) request = request.eq("slug", lawSlug);
  if (input.structureFilter === "unassigned") request = request.is("structure_id", null);
  if (typeof input.structureFilter === "number" && Number.isInteger(input.structureFilter) && input.structureFilter > 0) {
    request = request.eq("structure_id", input.structureFilter);
  }
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
    .or("situacao.is.null,situacao.neq.arquivada")
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
    .eq("lei_id", law.data.id).eq("slug", slug).not("legislacao", "is", null).or("situacao.is.null,situacao.neq.arquivada").order("ordem");
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
  const existing = await db.from("legislative_references").select("id", { count: "exact", head: true }).eq("lei_id", law.data.id).eq("slug", slug).or("situacao.is.null,situacao.neq.arquivada");
  if (existing.error) throw new Error("Não foi possível verificar a base legislativa.");
  const removed = await db.from("legislative_references").delete().eq("lei_id", law.data.id).eq("slug", slug).or("situacao.is.null,situacao.neq.arquivada");
  if (removed.error) throw new Error("Não foi possível limpar a base legislativa.");
  const audit = await db.rpc("admin_comercial_auditar", {
    p_ator_user_id: user.id, p_acao: "excluir", p_entidade: "base_legislativa", p_entidade_id: String(law.data.id),
    p_anterior: { slug, referencias: existing.count ?? 0 }, p_posterior: {},
    p_detalhes: { origem: "central_artigo_limpar_referencias", preservados: ["questions", "legisbot_comentarios"] },
  });
  if (audit.error) console.error("Falha ao auditar limpeza da base legislativa", { slug, code: audit.error.code });
  return { removed: existing.count ?? 0 };
}

async function documentImportPreview(lawSlug: string, name: string, bytes: Uint8Array, rawStructureId?: unknown) {
  const slug = text(lawSlug, 160).toLowerCase();
  if (!slug) throw new Error("Escolha uma legislação antes de importar o documento.");
  const parsed = parseLegislativeDocument(legislativeDocumentParagraphs(name, bytes));
  if (!parsed.references.length) throw new Error("Nenhuma referência estrutural foi encontrada no documento.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const structureId = Number(rawStructureId);
  const selectedStructureId = Number.isInteger(structureId) && structureId > 0 ? structureId : null;
  if (rawStructureId && !selectedStructureId) throw new Error("A estrutura selecionada é inválida.");
  if (selectedStructureId) {
    const structure = await db.from("law_structure").select("id").eq("id", selectedStructureId).eq("lei_id", law.data.id).eq("ativo", true).maybeSingle();
    if (structure.error || !structure.data) throw new Error("A estrutura selecionada não pertence a esta lei ou não está ativa.");
  }
  const structureResult = parsed.references.some((reference) => reference.structureTrail?.length)
    ? await db.from("law_structure").select("id,parent_id,nome,ordem").eq("lei_id", law.data.id).eq("ativo", true).order("ordem").order("id")
    : { data: [], error: null };
  if (structureResult.error) throw new Error("Não foi possível consultar as estruturas cadastradas da lei.");
  const structures = (structureResult.data ?? []) as Array<{ id: number; parent_id: number | null; nome: string; ordem: number }>;
  const normalizeStructureName = canonicalStructureName;
  const byId = new Map(structures.map((structure) => [Number(structure.id), structure]));
  const pathOf = (structure: { id: number; parent_id: number | null; nome: string }) => {
    const path: string[] = [];
    let current: { id: number; parent_id: number | null; nome: string } | undefined = structure;
    while (current) { path.unshift(normalizeStructureName(current.nome)); current = current.parent_id === null ? undefined : byId.get(Number(current.parent_id)); }
    return path;
  };
  const structureForTrail = (trail: string[] | undefined) => {
    if (!trail?.length) return { id: selectedStructureId, status: selectedStructureId ? "selecionada" : "sem_marcador" } as const;
    const markers = trail.map(normalizeStructureName);
    const matches = structures.filter((structure) => {
      const path = pathOf(structure);
      let cursor = 0;
      for (const marker of markers) { cursor = path.indexOf(marker, cursor); if (cursor < 0) return false; cursor += 1; }
      return path.at(-1) === markers.at(-1);
    });
    return matches.length === 1 ? { id: Number(matches[0].id), status: "documento" } as const : { id: null, status: matches.length ? "ambiguo" : "nao_encontrado" } as const;
  };
  const stored = await db.from("legislative_references").select("ordem,legislacao,structure_id").eq("lei_id", law.data.id).in("ordem", parsed.references.map((reference) => reference.ordem)).or("situacao.is.null,situacao.neq.arquivada");
  if (stored.error) throw new Error("Não foi possível verificar a base legislativa.");
  const existing = new Map((stored.data ?? []).map((row) => [String(row.ordem), {
    hasLegislation: typeof row.legislacao === "string" && row.legislacao.trim().length > 0,
    structureId: typeof row.structure_id === "number" ? row.structure_id : null,
  }]));
  const candidates = parsed.references.map((reference) => {
    const association = structureForTrail(reference.structureTrail);
    return { ...reference, structureId: association.id, structureStatus: association.status, operation: existing.has(reference.ordem) ? existing.get(reference.ordem)?.hasLegislation ? "preservar" as const : "preencher" as const : "criar" as const };
  });
  return { slug, lawId: Number(law.data.id), structureId: selectedStructureId, existing, references: candidates, rejected: parsed.rejected };
}

export async function previewLegislativeDocumentImport(input: { lawSlug: string; name: string; bytes: Uint8Array; structureId?: unknown }) {
  await exigirAdministrador();
  const preview = await documentImportPreview(input.lawSlug, input.name, input.bytes, input.structureId);
  // A amostra é apenas de leitura: o HTML vem do parser e é sanitizado no
  // servidor antes de seguir para o componente administrativo.
  return {
    slug: preview.slug,
    lawId: preview.lawId,
    structureId: preview.structureId,
    references: preview.references,
    rejected: preview.rejected,
    sample: preview.references.slice(0, 20).map((reference) => ({
      ...reference,
      displayLegislation: sanitizeLegalHtmlCore(reference.legislation),
    })),
  };
}

export async function importLegislativeDocument(input: { lawSlug: string; name: string; bytes: Uint8Array; expected: unknown; structureId?: unknown }) {
  await exigirAdministrador();
  const preview = await documentImportPreview(input.lawSlug, input.name, input.bytes, input.structureId);
  const expected = Array.isArray(input.expected) ? input.expected : [];
  const current = preview.references.map(({ ordem, identification, legislation, operation, structureId, structureStatus }) => ({ ordem, identification, legislation, operation, structureId, structureStatus }));
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
      const inserted = await db.from("legislative_references").insert({ lei_id: preview.lawId, slug: preview.slug, ordem: reference.ordem, identificacao: reference.identification, legislacao: reference.legislation, preparado_em: new Date().toISOString(), situacao: "preparada", ...(reference.structureId ? { structure_id: reference.structureId } : {}) }).select("id").maybeSingle();
      if (inserted.error || !inserted.data) throw new Error("Não foi possível criar uma referência do documento.");
      created += 1;
    } else {
      const existing = preview.existing.get(reference.ordem);
      const updated = await db.from("legislative_references").update({ legislacao: reference.legislation, preparado_em: new Date().toISOString(), situacao: "preparada", lei_revogadora: null, revogado_em: null, ...(reference.structureId && !existing?.structureId ? { structure_id: reference.structureId } : {}) }).eq("lei_id", preview.lawId).eq("ordem", reference.ordem).is("legislacao", null).select("id").maybeSingle();
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
  if (!slug || !ordem) throw new Error("Identificação do artigo sombra inválida.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug").eq("slug", slug).maybeSingle();
  if (law.error || !law.data) throw new Error("Legislação não encontrada.");
  const inventory = await db.from("legislative_reference_inventory")
    .select("ordem,identificacao,legislacao").eq("lei_id", law.data.id).eq("ordem", ordem).maybeSingle();
  if (inventory.error || !inventory.data) throw new Error("O dispositivo não consta no inventário oficial da lei.");
  const source = inventory.data as { ordem: string; identificacao: string; legislacao: string };
  if (!source.legislacao.trim()) throw new Error("O inventário oficial não contém o texto deste dispositivo.");
  const existing = await db.from("legislative_references").select("id,legislacao").eq("lei_id", law.data.id).eq("ordem", ordem).or("situacao.is.null,situacao.neq.arquivada").maybeSingle();
  if (existing.error) throw new Error("Não foi possível verificar a base legislativa.");
  if (existing.data?.legislacao?.trim()) throw new Error("Este dispositivo já possui texto preparado na base legislativa.");
  const payload = {
    identificacao: source.identificacao,
    legislacao: source.legislacao,
    preparado_em: new Date().toISOString(),
    situacao: resolution,
    lei_revogadora: null,
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
    .eq("slug", slug).or("situacao.is.null,situacao.neq.arquivada");
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

/** Toggles the visual inactive state while preserving text, UUID and links. */
export async function setLegislativeReferenceInactive(input: { id: unknown; inactive: unknown }) {
  await exigirAdministrador();
  const id = text(input.id, 100);
  if (!id) throw new Error("A referência legislativa não foi informada.");
  const inactive = input.inactive === true || input.inactive === "1" || input.inactive === "true";
  const result = await getSupabaseServerClient().from("legislative_references").update({
    situacao: inactive ? "revogada" : "preparada",
    lei_revogadora: null,
    revogado_em: inactive ? new Date().toISOString() : null,
  }).eq("id", id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Não foi possível atualizar a exibição deste dispositivo.");
}

/** Removes a block from the active base without destroying its audit trail. */
export async function archiveLegislativeReference(input: { id: unknown }) {
  await exigirAdministrador();
  const id = text(input.id, 100);
  if (!id) throw new Error("A referência legislativa não foi informada.");
  const result = await getSupabaseServerClient().from("legislative_references").update({
    situacao: "arquivada",
  }).eq("id", id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Não foi possível excluir este bloco da base legislativa.");
}

/** Moves only the legislative reference to a distinct canonical Ordem. */
export async function changeLegislativeReferenceOrder(input: { id: unknown; ordem: unknown }) {
  await exigirAdministrador();
  const id = text(input.id, 100);
  const ordem = text(input.ordem, 100);
  if (!id) throw new Error("A referência legislativa não foi informada.");
  if (!isCanonicalManualReferenceOrder(ordem)) throw new Error("A Ordem deve seguir o padrão artigo.letra.parágrafo.letra.inciso.letra.");
  const db = getSupabaseServerClient();
  const current = await db.from("legislative_references").select("lei_id,slug,ordem").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error("A referência legislativa não foi encontrada.");
  if (String(current.data.ordem) === ordem) return { slug: String(current.data.slug), ordem };
  const collision = await db.from("legislative_references").select("id").eq("lei_id", current.data.lei_id).eq("ordem", ordem).neq("id", id).maybeSingle();
  if (collision.error) throw new Error("Não foi possível verificar se a Ordem já está em uso.");
  if (collision.data) throw new Error("Já existe outra referência nesta lei com a Ordem informada. Abra-a para comparar antes de alterar o contexto.");
  const updated = await db.from("legislative_references").update({ ordem }).eq("id", id).select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("Não foi possível alterar a Ordem desta referência.");
  return { slug: String(current.data.slug), ordem };
}

/** Creates the one canonical reference for an already identified question context. */
export async function createLegislativeReferenceFromPreview(input: { lawSlug: string; ordem: unknown; identification: unknown }) {
  void input;
  throw new Error("Não é permitido criar bloco legislativo vazio. Importe ou cadastre primeiro o texto legal.");
}
