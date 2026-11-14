import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { resolveContinuousReadingIntegrity, type ContinuousReferenceSummary } from "@/lib/legisbot/continuous-reading-core";
import { resolveContinuousReadingReferenceStructureAssociations } from "@/lib/legisbot/continuous-reading-structure-core";
import { resolveContinuousReadingStructureIntegrity } from "@/lib/legisbot/continuous-reading-structure-integrity-core";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type LawRow = { id: number; slug: string; titulo: string; ativo: boolean; status_publicacao: string };
type StructureRow = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number; ativo: boolean; updated_at: string };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null; updated_at: string };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; source_question_id: string | null; structure_id: number | null; preparado_em: string | null; situacao: string | null; updated_at: string };
type InventoryRow = { ordem: string };

async function referencesWithMigrationFallback(lawId: number) {
  const db = getSupabaseServerClient();
  const withLink = await db.from("legislative_references")
    .select("id,slug,ordem,identificacao,source_question_id,structure_id,preparado_em,situacao,updated_at")
    .eq("lei_id", lawId).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id");
  if (!withLink.error) return (withLink.data ?? []) as ReferenceRow[];
  if (withLink.error.code !== "PGRST204" || !/structure_id/i.test(withLink.error.message ?? "")) {
    throw new Error("Não foi possível consultar a base legislativa da estrutura.");
  }
  const legacy = await db.from("legislative_references")
    .select("id,slug,ordem,identificacao,source_question_id,preparado_em,situacao,updated_at")
    .eq("lei_id", lawId).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id");
  if (legacy.error) throw new Error("Não foi possível consultar a base legislativa da estrutura.");
  return ((legacy.data ?? []) as Array<Omit<ReferenceRow, "structure_id">>).map((reference) => ({ ...reference, structure_id: null }));
}


/**
 * Diagnóstico administrativo sem efeitos. A saída é preparada para a futura
 * liberação manual por estrutura, mas não altera a regra pública atual.
 */
export async function getAdminLegislativeStructureIntegrity(rawSlug: string, proposedStructureByReferenceId: ReadonlyMap<string, number> = new Map()) {
  await exigirAdministrador();
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(slug)) return null;
  const db = getSupabaseServerClient();
  const lawResult = await db.from("leis").select("id,slug,titulo,ativo,status_publicacao").eq("slug", slug).maybeSingle();
  if (lawResult.error) throw new Error("Não foi possível consultar a legislação.");
  if (!lawResult.data) return null;
  const law = lawResult.data as LawRow;
  const [references, questionsResult, structuresResult, inventoryResult] = await Promise.all([
    referencesWithMigrationFallback(law.id),
    db.from("questions").select("id,slug,ordem,structure_id,updated_at").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,ativo,updated_at").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("legislative_reference_inventory").select("ordem").eq("lei_id", law.id).order("ordem"),
  ]);
  if (questionsResult.error || structuresResult.error) throw new Error("Não foi possível montar o diagnóstico estrutural.");
  if (inventoryResult.error && !["42P01", "PGRST205"].includes(inventoryResult.error.code)) throw new Error("Não foi possível consultar o inventário oficial da lei.");
  const questions = (questionsResult.data ?? []) as QuestionRow[];
  const structures = ((structuresResult.data ?? []) as StructureRow[]).map((structure) => ({ ...structure, parentId: structure.parent_id }));
  const manualTargets = await listManualQuestionReferenceTargets(questions.map((question) => question.id));
  const referenceSummaries: ContinuousReferenceSummary[] = references.map((reference) => ({
    id: reference.id, slug: reference.slug, ordem: reference.ordem, identificacao: reference.identificacao,
    sourceQuestionId: reference.source_question_id, prepared: Boolean(reference.preparado_em),
  }));
  const integrity = resolveContinuousReadingIntegrity({
    lawSlug: law.slug,
    questions: questions.map((question) => ({ id: question.id, slug: question.slug, ordem: question.ordem, structureId: question.structure_id })),
    references: referenceSummaries,
    manualTargets,
  });
  const associations = resolveContinuousReadingReferenceStructureAssociations({
    references: references.map((reference) => ({ id: reference.id, sourceQuestionId: reference.source_question_id, structureId: proposedStructureByReferenceId.get(reference.id) ?? reference.structure_id })),
    questions: questions.map((question) => ({ id: question.id, structureId: question.structure_id })),
    resolutions: integrity.resolutions,
    structures,
  });
  const report = resolveContinuousReadingStructureIntegrity({
    structures,
    questions: questions.map((question) => ({ id: question.id, structureId: question.structure_id })),
    references: referenceSummaries.map((reference) => ({ id: reference.id, ordem: reference.ordem, prepared: reference.prepared })),
    resolutions: integrity.resolutions,
    associations,
    inventoryAvailable: !inventoryResult.error && (inventoryResult.data?.length ?? 0) > 0,
    inventory: inventoryResult.error ? [] : (inventoryResult.data ?? []) as InventoryRow[],
  });
  const currentStructureByReference = new Map(references.map((reference) => [reference.id, proposedStructureByReferenceId.get(reference.id) ?? reference.structure_id]));
  return {
    law,
    integrity: report,
    structureNodes: structures,
    globalQuestionIntegrity: integrity,
    /** Sugestões são apenas evidência: só a confirmação administrativa grava o vínculo. */
    referenceAssociations: associations.map((association) => ({
      referenceId: association.referenceId,
      currentStructureId: currentStructureByReference.get(association.referenceId) ?? null,
      ordem: references.find((reference) => reference.id === association.referenceId)?.ordem ?? "",
      identification: references.find((reference) => reference.id === association.referenceId)?.identificacao ?? "Dispositivo sem identificação",
      suggestionStatus: association.suggestionStatus,
      suggestedStructureId: association.suggestedStructureId,
      /** Nulo ou fora das estruturas ativas da própria lei nunca é vínculo editorial válido. */
      pending: currentStructureByReference.get(association.referenceId) === null || association.status !== "editorial",
    })),
    integritySnapshot: {
      // `source_question_id` também participa da sugestão de associação. Ele
      // precisa integrar a fotografia usada pela RPC para que uma edição
      // concorrente nunca confirme/libere o recorte com evidência diferente.
      references: references.map((reference) => ({ id: reference.id, updatedAt: new Date(reference.updated_at).getTime(), structureId: reference.structure_id, sourceQuestionId: reference.source_question_id, ordem: reference.ordem, prepared: Boolean(reference.preparado_em), situacao: reference.situacao })).sort((a, b) => a.id.localeCompare(b.id)),
      questions: questions.map((question) => ({ id: question.id, updatedAt: new Date(question.updated_at).getTime(), structureId: question.structure_id, ordem: question.ordem })).sort((a, b) => a.id.localeCompare(b.id)),
      structures: (structuresResult.data ?? []).map((structure) => ({ id: Number(structure.id), updatedAt: new Date(String(structure.updated_at)).getTime(), parentId: structure.parent_id === null ? null : Number(structure.parent_id), ordem: Number(structure.ordem), ativo: Boolean(structure.ativo) })).sort((a, b) => a.id - b.id),
      manualLinks: manualTargets.map((link) => ({ questionId: link.questionId, referenceId: link.referenceId })).sort((a, b) => a.questionId.localeCompare(b.questionId)),
    },
  };
}
