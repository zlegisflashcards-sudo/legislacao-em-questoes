import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import {
  resolveContinuousReadingIntegrity,
  resolveLegacyReferenceId,
  resolveQuestionReferenceId,
  type ContinuousQuestion,
  type ContinuousReferenceSummary,
  type ReadingIntegrity,
} from "./continuous-reading-core";
import { incidenceFromQuestionCount } from "@/lib/article-mapping-incidence";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";
import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";
import { getContinuousReadingBlockTexts, type ContinuousReadingBlockText, type ContinuousReadingBlockTextRepository } from "./continuous-reading-block-texts-core";
import {
  continuousReadingStructurePath,
  orderContinuousReadingReferences,
  resolveContinuousReadingReferenceStructureAssociations,
  type ContinuousReadingReferenceStructureAssociation,
} from "./continuous-reading-structure-core";
import { resolveContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";
import { canExposeContinuousReadingReference, resolveContinuousReadingPartialMode, resolveContinuousReadingPublicAccess, type ContinuousReadingPartialMode, type ContinuousReadingPublicAccess } from "./continuous-reading-public-access-core";
import type { StructureReleaseRecord } from "./continuous-reading-structure-release-core";
import { attachConfirmedLegiscastAudioCoverage, type LegiscastCoverageTrack } from "@/lib/legiscast-audio-coverage-core";
import { resolveLegiscastStudyUnits, type LegiscastStudyUnit, type LegiscastStudyCoverageConflict } from "@/lib/legiscast-study-units-core";

const PAGE_SIZE = 500;

type LawRow = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; source_question_id: string | null; structure_id: number | null; preparado_em: string | null; situacao: string | null };
type StructureRow = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number; audio_not_applicable: boolean | null };
type MappingRow = { slug: string; ordem: string; artigo_recente: boolean | null };

export type ContinuousReadingPriority = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";

export type ContinuousHierarchyNode = { id: number; type: string; name: string };
export type ContinuousReadingReference = ContinuousReferenceSummary & {
  hierarchy: ContinuousHierarchyNode[];
  structureAssociation: ContinuousReadingReferenceStructureAssociation["status"];
  structureCandidateIds: number[];
  priority: ContinuousReadingPriority;
  recent: boolean;
  linkedQuestions: number;
  inactive: boolean;
};
export type ContinuousReadingStructureCatalogItem = {
  id: number;
  parentId: number | null;
  type: string;
  name: string;
  order: number;
  status: "accessible" | "pending" | "blocked";
};
export type ContinuousReadingBlock = ContinuousReadingReference & { legislation: string };

export type ContinuousReadingModel = {
  law: LawRow;
  /** Server-only snapshot used by legacy-resolution callers in this request. */
  questions: ContinuousQuestion[];
  references: ContinuousReadingReference[];
  integrity: ReadingIntegrity;
  /** Controle server-side opt-in; não altera a leitura global enquanto inativo. */
  partialMode: ContinuousReadingPartialMode;
  publicAccess: ContinuousReadingPublicAccess;
  structures: ContinuousReadingStructureCatalogItem[];
  /** Unidades de carregamento editoriais; nunca ampliam a cobertura de áudio pela hierarquia. */
  studyUnits: LegiscastStudyUnit[];
  studyUnitCoverageConflicts: LegiscastStudyCoverageConflict[];
};

function publicPriority(questionCount: number): ContinuousReadingPriority {
  return incidenceFromQuestionCount(questionCount);
}

async function allQuestions(lawId: number) {
  const db = getSupabaseServerClient();
  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await db.from("questions").select("id,slug,ordem,structure_id").eq("lei_id", lawId).eq("ativo", true).order("ordem").order("id").range(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error("Não foi possível verificar todas as questões ativas desta legislação.");
    rows.push(...((result.data ?? []) as QuestionRow[]));
    if ((result.data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

async function allReferenceSummaries(lawId: number) {
  const db = getSupabaseServerClient();
  const rows: ReferenceRow[] = [];
  let structureLinkAvailable = true;
  for (let from = 0; ; from += PAGE_SIZE) {
    const query = (columns: string) => db.from("legislative_references").select(columns).eq("lei_id", lawId).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id").range(from, from + PAGE_SIZE - 1);
    let result = await query("id,slug,ordem,identificacao,source_question_id,structure_id,preparado_em,situacao");
    // A migration é aditiva, mas a leitura pública não pode indisponibilizar-se
    // durante a janela entre a publicação do código e a aplicação da coluna.
    if (result.error?.code === "PGRST204" && /structure_id/i.test(result.error.message ?? "")) {
      structureLinkAvailable = false;
      const legacy = await query("id,slug,ordem,identificacao,source_question_id,preparado_em,situacao");
      if (legacy.error) throw new Error("A base legislativa canônica está indisponível.");
      const legacyRows = (legacy.data ?? []) as unknown as Array<Omit<ReferenceRow, "structure_id">>;
      rows.push(...legacyRows.map((reference) => ({ ...reference, structure_id: null })));
      if (legacyRows.length < PAGE_SIZE) break;
      continue;
    }
    if (result.error) throw new Error("A base legislativa canônica está indisponível.");
    rows.push(...((result.data ?? []) as unknown as ReferenceRow[]));
    if ((result.data?.length ?? 0) < PAGE_SIZE) break;
  }
  return { rows, structureLinkAvailable };
}

const PARTIAL_READING_KEY_PREFIX = "lei_interativa_modo_parcial:";

function migrationPending(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205";
}

/** A configuração é deliberadamente opt-in e só aceita o valor explícito. */
async function partialReadingRequested(slug: string) {
  const result = await getSupabaseServerClient().from("legisbot_configuracoes")
    .select("valor").eq("chave", `${PARTIAL_READING_KEY_PREFIX}${slug}`).maybeSingle();
  return !result.error && result.data?.valor?.trim().toLowerCase() === "habilitado";
}

async function readStructureReleases(lawId: number): Promise<{ available: boolean; records: StructureReleaseRecord[] }> {
  const result = await getSupabaseServerClient().from("legislative_structure_releases")
    .select("structure_id,status").eq("lei_id", lawId);
  if (result.error) {
    // A leitura global continua disponível se a migration ainda não chegou ao
    // banco; nunca tratamos ausência de tabela como autorização parcial.
    if (!migrationPending(result.error)) console.error("[LegisBot] Liberações estruturais indisponíveis.", { code: result.error.code });
    return { available: false, records: [] };
  }
  return { available: true, records: (result.data ?? []).flatMap((row) => row.status === "released" || row.status === "blocked" ? [{ structureId: Number(row.structure_id), status: row.status }] : []) };
}

export async function getContinuousReadingModel(rawSlug: string): Promise<ContinuousReadingModel | null> {
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(slug)) return null;
  const db = getSupabaseServerClient();
  const lawResult = await db.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("slug", slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
  if (lawResult.error) throw new Error("Não foi possível consultar a legislação.");
  if (!lawResult.data) return null;
  const law = lawResult.data as LawRow;
  const [questions, referenceResult, structure, mappings, requestedPartialMode] = await Promise.all([
    allQuestions(law.id),
    allReferenceSummaries(law.id),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,audio_not_applicable").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("article_context_mappings").select("slug,ordem,artigo_recente").eq("slug", slug),
    partialReadingRequested(slug),
  ]);
  if (structure.error) throw new Error("Não foi possível consultar a hierarquia da legislação.");
  const references = referenceResult.rows;
  const questionInput: ContinuousQuestion[] = questions.map((question) => ({ id: question.id, slug: question.slug, ordem: question.ordem, structureId: question.structure_id }));
  const targets = await listManualQuestionReferenceTargets(questionInput.map((question) => question.id));
  const referenceInput: ContinuousReferenceSummary[] = references.map((reference) => ({
    id: reference.id,
    slug: reference.slug,
    ordem: reference.ordem,
    // A grade do Mapa e a leitura usam a mesma identidade das questões:
    // Ordem canônica + nome curto já carregado da lei, sem consulta por cartão.
    identificacao: formatLegalReferenceFromOrder(reference.ordem, law.nome_curto, reference.identificacao) ?? reference.identificacao,
    sourceQuestionId: reference.source_question_id,
    prepared: Boolean(reference.preparado_em),
  }));
  const inactiveReferenceIds = new Set(references.filter((reference) => reference.situacao === "revogada").map((reference) => reference.id));
  const integrity: ReadingIntegrity = resolveContinuousReadingIntegrity({ lawSlug: law.slug, questions: questionInput, references: referenceInput, manualTargets: targets });

  const readingStructure = ((structure.data ?? []) as StructureRow[]).map((node) => ({ ...node, parentId: node.parent_id }));
  const structureAssociations = resolveContinuousReadingReferenceStructureAssociations({
    references: references.map((reference) => ({ id: reference.id, sourceQuestionId: reference.source_question_id, structureId: reference.structure_id })),
    questions: questions.map((question) => ({ id: question.id, structureId: question.structure_id })),
    resolutions: integrity.resolutions,
    structures: readingStructure,
  });
  const associationByReference = new Map(structureAssociations.map((association) => [association.referenceId, association]));

  // A revalidação é feita no instante da leitura. Em caso de inventário ou
  // migration indisponível, o modo parcial não é ativado; a política global
  // previamente publicada permanece sendo a única rota possível.
  let partialMode = resolveContinuousReadingPartialMode({ requested: requestedPartialMode, migrationsAvailable: false, structures: readingStructure });
  let publicAccess = resolveContinuousReadingPublicAccess({ mode: partialMode, structures: readingStructure, reports: [], releases: [] });
  let structureReports: ReturnType<typeof resolveContinuousReadingStructureIntegrity>["reports"] = [];
  let releaseRecords: StructureReleaseRecord[] = [];
  if (requestedPartialMode && referenceResult.structureLinkAvailable && readingStructure.length) {
    const [inventoryResult, releases] = await Promise.all([
      db.from("legislative_reference_inventory").select("ordem").eq("lei_id", law.id).order("ordem"),
      readStructureReleases(law.id),
    ]);
    const inventoryAvailable = !inventoryResult.error && (inventoryResult.data?.length ?? 0) > 0;
    const migrationsAvailable = releases.available && !inventoryResult.error && referenceResult.structureLinkAvailable;
    partialMode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable, structures: readingStructure });
    const structureIntegrity = resolveContinuousReadingStructureIntegrity({
      structures: readingStructure,
      questions: questions.map((question) => ({ id: question.id, structureId: question.structure_id })),
      references: referenceInput.map((reference) => ({ id: reference.id, ordem: reference.ordem, prepared: reference.prepared })),
      resolutions: integrity.resolutions,
      associations: structureAssociations,
      inventoryAvailable,
      inventory: inventoryResult.error ? [] : (inventoryResult.data ?? []) as Array<{ ordem: string }>,
    });
    structureReports = structureIntegrity.reports;
    releaseRecords = releases.records;
    publicAccess = resolveContinuousReadingPublicAccess({ mode: partialMode, structures: readingStructure, reports: structureIntegrity.reports, releases: releases.records });
  }

  const questionCountByReference = new Map<string, number>();
  for (const resolution of integrity.resolutions) {
    if (!resolution.referenceId) continue;
    questionCountByReference.set(resolution.referenceId, (questionCountByReference.get(resolution.referenceId) ?? 0) + 1);
  }
  const mappingByContext = new Map(
    ((mappings.error ? [] : mappings.data ?? []) as MappingRow[]).map((mapping) => [
      `${mapping.slug.toLowerCase()}\u0000${mapping.ordem}`,
      mapping,
    ]),
  );

  const publicReferences = orderContinuousReadingReferences(referenceInput).flatMap((reference) => {
    const linkedQuestions = questionCountByReference.get(reference.id) ?? 0;
    const mapping = mappingByContext.get(`${reference.slug.toLowerCase()}\u0000${reference.ordem}`);
    const association = associationByReference.get(reference.id) ?? { structureId: null, status: "unassociated" as const, candidateStructureIds: [], suggestionStatus: "unassociated" as const, suggestedStructureId: null };
    if (!canExposeContinuousReadingReference({ access: publicAccess, associationStatus: association.status, structureId: association.structureId })) return [];
    return [{
      ...reference,
      hierarchy: continuousReadingStructurePath(association.structureId, readingStructure).map((node) => ({ id: node.id, type: node.tipo, name: node.nome })),
      structureAssociation: association.status,
      structureCandidateIds: association.candidateStructureIds,
      priority: publicPriority(linkedQuestions),
      recent: mapping?.artigo_recente === true,
      linkedQuestions,
      inactive: inactiveReferenceIds.has(reference.id),
    }];
  });
  const reportByStructure = new Map(structureReports.map((report) => [report.structureId, report]));
  const releaseByStructure = new Map(releaseRecords.map((release) => [release.structureId, release.status]));
  const structures: ContinuousReadingStructureCatalogItem[] = readingStructure.map((structure) => ({
    id: structure.id,
    parentId: structure.parentId,
    type: structure.tipo,
    name: structure.nome,
    order: structure.ordem,
    status: publicAccess.mode === "global"
      ? "accessible"
      : releaseByStructure.get(structure.id) === "blocked"
        ? "blocked"
        : publicAccess.accessibleStructureIds.includes(structure.id) && reportByStructure.get(structure.id)?.status === "ready"
          ? "accessible"
          : "pending",
  }));

  // A unidade de estudo é uma projeção da mesma hierarquia da lei e das
  // coberturas explicitamente confirmadas. Se a migration de cobertura ainda
  // não existir, continuamos com unidades textuais por estrutura — sem supor
  // que uma faixa ancestral cubra seus descendentes.
  const [tracksResult, coverageResult] = await Promise.all([
    db.from("legiscast_audios").select("id,structure_id").eq("lei_id", law.id).eq("ativo", true),
    db.from("legiscast_audio_structure_coverage").select("audio_id,structure_id").eq("lei_id", law.id),
  ]);
  const tracks: LegiscastCoverageTrack[] = tracksResult.error ? [] : (tracksResult.data ?? []).map((track) => ({
    id: String(track.id),
    structureId: track.structure_id === null ? null : Number(track.structure_id),
    active: true,
  }));
  const coveredTracks = attachConfirmedLegiscastAudioCoverage(
    tracks,
    coverageResult.error && migrationPending(coverageResult.error)
      ? []
      : coverageResult.error
        ? []
        : (coverageResult.data ?? []).map((coverage) => ({ audioId: String(coverage.audio_id), structureId: Number(coverage.structure_id) })),
  );
  const rawStudyUnits = resolveLegiscastStudyUnits({
    structures: readingStructure.map((structure) => ({ id: structure.id, parentId: structure.parentId, ordem: structure.ordem, name: structure.nome })),
    tracks: coveredTracks,
    notApplicableStructureIds: readingStructure.filter((structure) => structure.audio_not_applicable === true).map((structure) => structure.id),
  });
  const allowedStudyStructures = new Set(publicAccess.mode === "partial" ? publicAccess.accessibleStructureIds : readingStructure.map((structure) => structure.id));
  const preparedStudyStructures = new Set(publicReferences.filter((reference) => reference.prepared).map((reference) => reference.hierarchy.at(-1)?.id).filter((id): id is number => typeof id === "number"));
  const studyUnits = rawStudyUnits.units.flatMap((unit) => {
    const structureIds = unit.structureIds.filter((structureId) => allowedStudyStructures.has(structureId));
    if (!structureIds.length || !structureIds.some((structureId) => preparedStudyStructures.has(structureId))) return [];
    return [{ ...unit, titleStructureId: structureIds.includes(unit.titleStructureId) ? unit.titleStructureId : structureIds[0], structureIds }];
  });

  return {
    law,
    questions: questionInput,
    // No modo parcial, pendências de outros recortes não derrubam a leitura
    // dos recortes liberados. No global, a regra histórica é preservada.
    integrity: publicAccess.mode === "partial" ? { ...integrity, readingAvailable: publicReferences.length > 0 } : integrity,
    references: publicReferences,
    partialMode,
    publicAccess,
    structures,
    studyUnits,
    studyUnitCoverageConflicts: rawStudyUnits.conflicts,
  };
}

export function continuousReadingReferencesForStructure(model: ContinuousReadingModel, structureId: number | null) {
  if (model.publicAccess.mode !== "partial" || structureId === null) return model.references;
  if (!model.publicAccess.accessibleStructureIds.includes(structureId)) return [] as ContinuousReadingReference[];
  return model.references.filter((reference) => reference.hierarchy.some((node) => node.id === structureId));
}

/** Uma unidade só reúne os blocos associados diretamente às estruturas que a compõem. */
export function continuousReadingReferencesForStudyUnit(model: ContinuousReadingModel, studyUnitId: string | null) {
  const unit = studyUnitId === null ? null : model.studyUnits.find((candidate) => candidate.id === studyUnitId);
  if (!unit) return [] as ContinuousReadingReference[];
  const structureIds = new Set(unit.structureIds);
  return model.references.filter((reference) => {
    const structureId = reference.hierarchy.at(-1)?.id ?? null;
    return structureId !== null && structureIds.has(structureId);
  });
}

export async function getContinuousReadingBlocks(model: ContinuousReadingModel, offset: number, limit: number, structureId: number | null = null, studyUnitId: string | null = null) {
  if (!model.integrity.readingAvailable) return [] as ContinuousReadingBlock[];
  const selectedReferences = studyUnitId === null ? continuousReadingReferencesForStructure(model, structureId) : continuousReadingReferencesForStudyUnit(model, studyUnitId);
  const prepared = selectedReferences.filter((reference) => reference.prepared);
  const selected = prepared.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(100, Math.max(1, limit)));
  if (!selected.length) return [];
  const result = await getSupabaseServerClient().from("legislative_references").select("id,legislacao").eq("lei_id", model.law.id).in("id", selected.map((reference) => reference.id)).or("situacao.is.null,situacao.neq.arquivada");
  if (result.error) throw new Error("Não foi possível carregar os blocos legislativos.");
  const legislationById = new Map((result.data ?? []).map((row) => [String(row.id), sanitizeLegalHtmlCore(String(row.legislacao ?? "")).trim()]));
  return selected.flatMap((reference) => {
    const legislation = legislationById.get(reference.id);
    return legislation ? [{ ...reference, legislation }] : [];
  });
}

export { getContinuousReadingBlockTexts, type ContinuousReadingBlockText, type ContinuousReadingBlockTextRepository } from "./continuous-reading-block-texts-core";

export async function getContinuousReadingBlockTextsForLaw(rawSlug: string, rawIds: string[], rawStructureId: string | null = null, rawStudyUnitId: string | null = null) {
  const db = getSupabaseServerClient();
  const slug = rawSlug.trim().toLowerCase();
  // A página envia somente IDs do seu catálogo. A rota revalida no servidor
  // quando o modo parcial foi solicitado, portanto um UUID copiado de outro
  // recorte não contorna a política alterando a URL.
  // No modo parcial, a unidade é um escopo validado pelo catálogo do servidor:
  // um UUID copiado de outro recorte não contorna a liberação pela URL. No modo
  // global todos os blocos preparados da própria lei já pertencem à leitura
  // autorizada, e evitamos reconstruir o catálogo inteiro a cada página.
  if (rawStudyUnitId !== null || await partialReadingRequested(slug)) {
    const model = await getContinuousReadingModel(slug);
    if (!model) return null;
    if (model.publicAccess.mode === "partial" || rawStudyUnitId !== null) {
      const structureId = rawStructureId && /^\d+$/.test(rawStructureId) ? Number(rawStructureId) : null;
      const allowedReferences = rawStudyUnitId === null
        ? continuousReadingReferencesForStructure(model, structureId)
        : continuousReadingReferencesForStudyUnit(model, rawStudyUnitId);
      const allowed = new Set(allowedReferences.filter((reference) => reference.prepared).map((reference) => reference.id.toLowerCase()));
      const requested = rawIds.filter((id) => allowed.has(id.trim().toLowerCase()));
      if (!requested.length) return [] as ContinuousReadingBlockText[];
      return getContinuousReadingBlockTexts(slug, requested, {
        async findActiveLaw() { return { id: model.law.id }; },
        async findPreparedBlocks(lawId, referenceIds) {
          const result = await db.from("legislative_references").select("id,legislacao").eq("lei_id", lawId).not("preparado_em", "is", null).in("id", referenceIds).or("situacao.is.null,situacao.neq.arquivada");
          if (result.error) throw new Error("Não foi possível carregar os blocos legislativos.");
          return (result.data ?? []).map((row) => ({ id: String(row.id), legislation: String(row.legislacao ?? "") }));
        },
      });
    }
  }
  return getContinuousReadingBlockTexts(rawSlug, rawIds, {
    async findActiveLaw(slug) {
      const result = await db.from("leis").select("id").eq("slug", slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
      if (result.error) throw new Error("Não foi possível consultar a legislação.");
      return result.data ? { id: Number(result.data.id) } : null;
    },
    async findPreparedBlocks(lawId, referenceIds) {
      const result = await db.from("legislative_references").select("id,legislacao").eq("lei_id", lawId).not("preparado_em", "is", null).in("id", referenceIds).or("situacao.is.null,situacao.neq.arquivada");
      if (result.error) throw new Error("Não foi possível carregar os blocos legislativos.");
      return (result.data ?? []).map((row) => ({ id: String(row.id), legislation: String(row.legislacao ?? "") }));
    },
  });
}

export async function resolveContinuousReference(rawSlug: string, rawOrder: string) {
  const model = await getContinuousReadingModel(rawSlug);
  return resolveContinuousReferenceFromModel(model, rawOrder);
}

/** Reutiliza o snapshot já carregado pela página, sem nova consulta integral. */
export function resolveContinuousReferenceFromModel(model: ContinuousReadingModel | null, rawOrder: string) {
  if (!model?.integrity.readingAvailable) return null;
  const referenceId = resolveLegacyReferenceId({
    rawOrder,
    questions: model.questions,
    references: model.references,
    resolutions: model.integrity.resolutions,
  });
  return referenceId ? model.references.find((reference) => reference.id === referenceId) ?? null : null;
}

/** Resolve um link de Anki pela identidade da questão, sem escolher âncoras ambíguas. */
export async function resolveContinuousQuestionReference(rawSlug: string, rawQuestionId: string) {
  const model = await getContinuousReadingModel(rawSlug);
  return resolveContinuousQuestionReferenceFromModel(model, rawQuestionId);
}

/** Resolve pelo UUID no snapshot já carregado, preservando o vínculo manual. */
export function resolveContinuousQuestionReferenceFromModel(model: ContinuousReadingModel | null, rawQuestionId: string) {
  if (!model?.integrity.readingAvailable) return null;
  const referenceId = resolveQuestionReferenceId({
    questionId: rawQuestionId,
    questions: model.questions,
    references: model.references,
    resolutions: model.integrity.resolutions,
  });
  return referenceId ? model.references.find((reference) => reference.id === referenceId) ?? null : null;
}

/** @deprecated Exportadores 4.0 resolvem por IDQuestao no site; mantido para chamadores legados. */
export async function getContinuousQuestionDestinations(_rawSlug: string) {
  return new Map<string, string>();
}
