import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { resolveContinuousReadingIntegrity, type ContinuousReferenceSummary } from "@/lib/legisbot/continuous-reading-core";
import { resolveContinuousReadingReferenceStructureAssociations } from "@/lib/legisbot/continuous-reading-structure-core";
import { resolveContinuousReadingStructureIntegrity } from "@/lib/legisbot/continuous-reading-structure-integrity-core";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type LawRow = { id: number; slug: string; titulo: string; ativo: boolean; status_publicacao: string };
type StructureRow = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; source_question_id: string | null; structure_id: number | null; preparado_em: string | null; situacao: string | null };
type InventoryRow = { ordem: string };

async function referencesWithMigrationFallback(lawId: number) {
  const db = getSupabaseServerClient();
  const withLink = await db.from("legislative_references")
    .select("id,slug,ordem,identificacao,source_question_id,structure_id,preparado_em,situacao")
    .eq("lei_id", lawId).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id");
  if (!withLink.error) return (withLink.data ?? []) as ReferenceRow[];
  if (withLink.error.code !== "PGRST204" || !/structure_id/i.test(withLink.error.message ?? "")) {
    throw new Error("Não foi possível consultar a base legislativa da estrutura.");
  }
  const legacy = await db.from("legislative_references")
    .select("id,slug,ordem,identificacao,source_question_id,preparado_em,situacao")
    .eq("lei_id", lawId).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id");
  if (legacy.error) throw new Error("Não foi possível consultar a base legislativa da estrutura.");
  return ((legacy.data ?? []) as Array<Omit<ReferenceRow, "structure_id">>).map((reference) => ({ ...reference, structure_id: null }));
}

/**
 * Diagnóstico administrativo sem efeitos. A saída é preparada para a futura
 * liberação manual por estrutura, mas não altera a regra pública atual.
 */
export async function getAdminLegislativeStructureIntegrity(rawSlug: string) {
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
    db.from("questions").select("id,slug,ordem,structure_id").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
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
    references: references.map((reference) => ({ id: reference.id, sourceQuestionId: reference.source_question_id, structureId: reference.structure_id })),
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
  return { law, integrity: report, structureNodes: structures, globalQuestionIntegrity: integrity };
}
