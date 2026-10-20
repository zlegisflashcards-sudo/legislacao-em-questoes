import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildAdministrativePreviewItems, findAdministrativeShadowArticles, type AdministrativePreviewItem, type PreviewInventoryRow, type PreviewQuestionRow, type PreviewReferenceRow } from "@/lib/admin-legislative-preview-core";
import { resolveContinuousReadingIntegrity } from "@/lib/legisbot/continuous-reading-core";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";

type LawRow = { id: number; slug: string; titulo: string; nome_curto: string | null };
type ReferenceRow = PreviewReferenceRow;
type QuestionRow = PreviewQuestionRow;
export type { AdministrativePreviewItem } from "@/lib/admin-legislative-preview-core";

export type AdministrativeLegislativePreview = {
  law: LawRow;
  items: AdministrativePreviewItem[];
  unresolvedQuestionCount: number;
  orphanQuestions: PreviewQuestionRow[];
  unpositionedQuestions: PreviewQuestionRow[];
  inventoryAvailable: boolean;
  shadowArticles: Array<{ ordem: string; identification: string }>;
};

/**
 * Administrative reading is deliberately independent from the student release
 * gate. It only shows records that actually exist or question contexts with a
 * parsable canonical Ordem; it never manufactures numeric gaps.
 */
export async function getAdministrativeLegislativePreview(rawSlug: string): Promise<AdministrativeLegislativePreview | null> {
  await exigirAdministrador();
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(slug)) return null;
  const db = getSupabaseServerClient();
  const lawResult = await db.from("leis").select("id,slug,titulo,nome_curto").eq("slug", slug).maybeSingle();
  if (lawResult.error) throw new Error("Não foi possível consultar a legislação da prévia.");
  if (!lawResult.data) return null;
  const law = lawResult.data as LawRow;
  const [referenceResult, questionResult, inventoryResult] = await Promise.all([
    db.from("legislative_references").select("id,slug,ordem,identificacao,legislacao,situacao,lei_revogadora").eq("lei_id", law.id).order("ordem"),
    db.from("questions").select("id,ordem,assunto").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("legislative_reference_inventory").select("ordem,identificacao,legislacao").eq("lei_id", law.id).order("ordem"),
  ]);
  if (referenceResult.error) throw new Error("Não foi possível carregar as referências legislativas da prévia.");
  if (questionResult.error) throw new Error("Não foi possível contar as questões da prévia.");
  // Enquanto a migration ainda não chegou a um ambiente, a prévia continua
  // utilizável; apenas informa que ainda não consegue auditar sombras. Outros
  // erros continuam visíveis para não esconder uma falha de consulta real.
  if (inventoryResult.error && !["42P01", "PGRST205"].includes(inventoryResult.error.code)) throw new Error("Não foi possível consultar o inventário oficial da lei.");

  const assembled = buildAdministrativePreviewItems(law.slug, (referenceResult.data ?? []) as ReferenceRow[], (questionResult.data ?? []) as QuestionRow[]);
  const questionRows = (questionResult.data ?? []) as QuestionRow[];
  const manualTargets = await listManualQuestionReferenceTargets(questionRows.map((question) => question.id));
  const integrity = resolveContinuousReadingIntegrity({
    lawSlug: law.slug,
    questions: questionRows.map((question) => ({ id: question.id, slug: law.slug, ordem: question.ordem, structureId: null })),
    references: ((referenceResult.data ?? []) as ReferenceRow[]).map((reference) => ({
      id: reference.id,
      slug: reference.slug,
      ordem: reference.ordem,
      identificacao: reference.identificacao,
      sourceQuestionId: null,
      prepared: reference.situacao !== "revogada" && Boolean(reference.legislacao?.trim()),
    })),
    manualTargets,
  });
  const orphanIds = new Set(integrity.resolutions.filter((resolution) => !resolution.referenceId).map((resolution) => resolution.questionId));
  const inventory = inventoryResult.error ? [] : (inventoryResult.data ?? []) as PreviewInventoryRow[];

  return {
    law,
    items: assembled.items,
    unresolvedQuestionCount: assembled.unresolvedQuestionCount,
    orphanQuestions: questionRows.filter((question) => orphanIds.has(question.id)),
    unpositionedQuestions: assembled.orphanQuestions,
    inventoryAvailable: inventory.length > 0,
    shadowArticles: findAdministrativeShadowArticles(inventory, (referenceResult.data ?? []) as ReferenceRow[]),
  };
}
