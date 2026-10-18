import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildAdministrativePreviewItems, type AdministrativePreviewItem, type PreviewQuestionRow, type PreviewReferenceRow } from "@/lib/admin-legislative-preview-core";

type LawRow = { id: number; slug: string; titulo: string; nome_curto: string | null };
type ReferenceRow = PreviewReferenceRow;
type QuestionRow = PreviewQuestionRow;
export type { AdministrativePreviewItem } from "@/lib/admin-legislative-preview-core";

export type AdministrativeLegislativePreview = {
  law: LawRow;
  items: AdministrativePreviewItem[];
  unresolvedQuestionCount: number;
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
  const [referenceResult, questionResult] = await Promise.all([
    db.from("legislative_references").select("id,slug,ordem,identificacao,legislacao,situacao,lei_revogadora").eq("lei_id", law.id).order("ordem"),
    db.from("questions").select("id,ordem,assunto").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
  ]);
  if (referenceResult.error) throw new Error("Não foi possível carregar as referências legislativas da prévia.");
  if (questionResult.error) throw new Error("Não foi possível contar as questões da prévia.");

  const assembled = buildAdministrativePreviewItems(law.slug, (referenceResult.data ?? []) as ReferenceRow[], (questionResult.data ?? []) as QuestionRow[]);

  return {
    law,
    items: assembled.items,
    unresolvedQuestionCount: assembled.unresolvedQuestionCount,
  };
}
