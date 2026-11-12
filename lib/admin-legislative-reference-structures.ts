import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { assertLegislativeReferenceStructureLaw, LegislativeReferenceStructureLinkError } from "@/lib/legislative-reference-structure-link-core";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";
import { resolveContinuousReadingIntegrity } from "@/lib/legisbot/continuous-reading-core";
import { continuousReadingStructurePath, resolveContinuousReadingReferenceStructureAssociations } from "@/lib/legisbot/continuous-reading-structure-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Permite preservar a Central enquanto a migration aditiva ainda não foi aplicada. */
export class LegislativeReferenceStructureMigrationRequiredError extends Error {
  constructor() {
    super("A migration da associação estrutural ainda não foi aplicada.");
    this.name = "LegislativeReferenceStructureMigrationRequiredError";
  }
}

type StructureRow = { id: number; lei_id: number; parent_id: number | null; tipo: string; nome: string; ordem: number };
type ReferenceRow = { id: string; lei_id: number; slug: string; ordem: string; identificacao: string; source_question_id: string | null; structure_id: number | null; preparado_em: string | null };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null };

function throwIfStructureColumnIsMissing(error: { code?: string; message?: string } | null) {
  if (error?.code === "PGRST204" && /structure_id/i.test(error.message ?? "")) {
    throw new LegislativeReferenceStructureMigrationRequiredError();
  }
}

function labelForStructure(structureId: number | null, structures: Array<StructureRow & { parentId: number | null }>) {
  if (structureId === null) return null;
  const path = continuousReadingStructurePath(structureId, structures);
  return path.length ? path.map((node) => node.nome).join(" › ") : null;
}

async function requireAdmin() {
  const user = await obterAdministrador();
  if (!user) throw new Error("Autenticação administrativa obrigatória.");
  return user;
}

export async function getAdminLegislativeReferenceStructureAssociation(input: { referenceId: string }) {
  await requireAdmin();
  const referenceId = input.referenceId.trim();
  if (!UUID.test(referenceId)) throw new Error("Referência legislativa inválida.");
  const db = getSupabaseServerClient();
  const selected = await db.from("legislative_references")
    .select("id,lei_id,slug,ordem,identificacao,source_question_id,structure_id,preparado_em")
    .eq("id", referenceId)
    .or("situacao.is.null,situacao.neq.arquivada")
    .maybeSingle();
  throwIfStructureColumnIsMissing(selected.error);
  if (selected.error || !selected.data) throw new Error("Referência legislativa não encontrada.");
  const reference = selected.data as ReferenceRow;
  const [lawResult, referencesResult, questionsResult, structuresResult] = await Promise.all([
    db.from("leis").select("id,titulo").eq("id", reference.lei_id).maybeSingle(),
    db.from("legislative_references").select("id,lei_id,slug,ordem,identificacao,source_question_id,structure_id,preparado_em").eq("lei_id", reference.lei_id).or("situacao.is.null,situacao.neq.arquivada").order("ordem").order("id"),
    db.from("questions").select("id,slug,ordem,structure_id").eq("lei_id", reference.lei_id).eq("ativo", true).order("ordem").order("id"),
    db.from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem").eq("lei_id", reference.lei_id).eq("ativo", true).order("ordem").order("id"),
  ]);
  if (lawResult.error || !lawResult.data || referencesResult.error || questionsResult.error || structuresResult.error) {
    throwIfStructureColumnIsMissing(referencesResult.error);
    throw new Error("Não foi possível preparar a associação estrutural desta referência.");
  }
  const references = (referencesResult.data ?? []) as ReferenceRow[];
  const questions = (questionsResult.data ?? []) as QuestionRow[];
  const structures = ((structuresResult.data ?? []) as StructureRow[]).map((structure) => ({ ...structure, parentId: structure.parent_id }));
  const manualTargets = await listManualQuestionReferenceTargets(questions.map((question) => question.id));
  const integrity = resolveContinuousReadingIntegrity({
    lawSlug: reference.slug,
    questions: questions.map((question) => ({ id: question.id, slug: question.slug, ordem: question.ordem, structureId: question.structure_id })),
    references: references.map((item) => ({ id: item.id, slug: item.slug, ordem: item.ordem, identificacao: item.identificacao, sourceQuestionId: item.source_question_id, prepared: Boolean(item.preparado_em) })),
    manualTargets,
  });
  const association = resolveContinuousReadingReferenceStructureAssociations({
    references: references.map((item) => ({ id: item.id, sourceQuestionId: item.source_question_id, structureId: item.structure_id })),
    questions: questions.map((question) => ({ id: question.id, structureId: question.structure_id })),
    resolutions: integrity.resolutions,
    structures,
  }).find((item) => item.referenceId === reference.id);
  if (!association) throw new Error("Não foi possível identificar a associação estrutural desta referência.");
  return {
    law: { id: Number(lawResult.data.id), title: String(lawResult.data.titulo) },
    reference: { id: reference.id, ordem: reference.ordem, identification: reference.identificacao },
    currentStructureId: reference.structure_id,
    currentStructureLabel: labelForStructure(reference.structure_id, structures),
    suggestion: {
      status: association.suggestionStatus,
      structureId: association.suggestedStructureId,
      label: labelForStructure(association.suggestedStructureId, structures),
      candidateStructureIds: association.candidateStructureIds,
      candidateLabels: association.candidateStructureIds.map((id) => labelForStructure(id, structures)).filter((label): label is string => Boolean(label)),
    },
    options: structures.map((structure) => ({ id: structure.id, label: labelForStructure(structure.id, structures) ?? structure.nome })),
  };
}

export async function setAdminLegislativeReferenceStructureAssociation(input: { referenceId: unknown; structureId: unknown }) {
  const user = await requireAdmin();
  const referenceId = typeof input.referenceId === "string" ? input.referenceId.trim() : "";
  if (!UUID.test(referenceId)) throw new Error("Referência legislativa inválida.");
  const structureId = input.structureId === null || input.structureId === "" ? null : Number(input.structureId);
  if (structureId !== null && (!Number.isSafeInteger(structureId) || structureId <= 0)) throw new Error("Estrutura legislativa inválida.");
  const db = getSupabaseServerClient();
  const current = await db.from("legislative_references").select("id,lei_id,structure_id,slug,ordem").eq("id", referenceId).maybeSingle();
  throwIfStructureColumnIsMissing(current.error);
  if (current.error || !current.data) throw new Error("Referência legislativa não encontrada.");
  let structureLawId: number | null = null;
  if (structureId !== null) {
    const structure = await db.from("law_structure").select("id,lei_id").eq("id", structureId).maybeSingle();
    if (structure.error || !structure.data) throw new Error("Estrutura legislativa não encontrada.");
    structureLawId = Number(structure.data.lei_id);
  }
  try {
    assertLegislativeReferenceStructureLaw({ referenceLawId: Number(current.data.lei_id), structureLawId });
  } catch (error) {
    if (error instanceof LegislativeReferenceStructureLinkError) throw error;
    throw new Error("Não foi possível validar a estrutura selecionada.");
  }
  const updated = await db.from("legislative_references").update({ structure_id: structureId }).eq("id", referenceId).eq("lei_id", current.data.lei_id).select("id,structure_id").maybeSingle();
  if (updated.error?.code === "23503" || updated.error?.code === "23514") throw new Error("A estrutura selecionada não pertence à mesma lei da referência.");
  if (updated.error || !updated.data) throw new Error("Não foi possível salvar a associação estrutural.");
  const audit = await db.rpc("admin_comercial_auditar", {
    p_ator_user_id: user.id,
    p_acao: "atualizar",
    p_entidade: "referencia_legislativa_estrutura",
    p_entidade_id: referenceId,
    p_anterior: { structure_id: current.data.structure_id, slug: current.data.slug, ordem: current.data.ordem },
    p_posterior: { structure_id: updated.data.structure_id, slug: current.data.slug, ordem: current.data.ordem },
    p_detalhes: { origem: "central_artigo_associacao_estrutura" },
  });
  if (audit.error) console.error("Falha ao auditar associação estrutural da referência", { referenceId, code: audit.error.code });
  return { id: String(updated.data.id), structureId: updated.data.structure_id === null ? null : Number(updated.data.structure_id) };
}
