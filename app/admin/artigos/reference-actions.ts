"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearLegislativeReferences, createLegislativeReferenceFromPreview, importQuestionLegislationToReferences, repairLegislativeReferenceIdentifiers, saveLegislativeReference, seedLegislativeReferences } from "@/lib/admin-legislative-references";

const value = (formData: FormData, field: string) => String(formData.get(field) ?? "").trim();

export async function prepareLegislativeReferences(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  await seedLegislativeReferences(slug);
  revalidatePath("/admin/artigos");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&preparacao=concluida`);
}

export async function importQuestionLegislation(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const result = await importQuestionLegislationToReferences(slug);
  revalidatePath("/admin/artigos");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&importacao=${encodeURIComponent(`${result.imported},${result.skippedExisting},${result.skippedConflicts},${result.skippedEmpty}`)}`);
}

export async function clearPreparedLegislativeReferences(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  if (value(formData, "confirmation") !== "LIMPAR BASE") redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&erro=confirmacao_limpeza`);
  const result = await clearLegislativeReferences(slug);
  revalidatePath("/admin/artigos");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&base=limpa&removidas=${result.removed}`);
}

export async function previewLegislativeReferenceIdentifierRepair(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&reparo_identificadores=previa`);
}

export async function applyLegislativeReferenceIdentifierRepair(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  if (value(formData, "confirmation") !== "REPARAR IDENTIFICADORES") {
    redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&reparo_identificadores=confirmacao`);
  }
  let expected: Array<{ id: string; updatedAt: string }> = [];
  try { expected = JSON.parse(value(formData, "expected")); } catch { /* handled below */ }
  const result = await repairLegislativeReferenceIdentifiers({ lawSlug: slug, expected });
  revalidatePath("/admin/artigos");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&reparo_identificadores=aplicado&reparadas=${result.repaired}&ignoradas=${result.skipped}`);
}

export async function savePreparedLegislativeReference(formData: FormData) {
  await saveLegislativeReference({
    id: value(formData, "id"),
    identification: formData.get("identification"),
    legislation: formData.get("legislation"),
    status: formData.get("status"),
    revokingLaw: formData.get("revoking_law"),
  });
  const slug = value(formData, "slug").toLowerCase();
  const ordem = value(formData, "ordem");
  const returnToPreview = value(formData, "return_to_preview") === "1";
  revalidatePath("/admin/artigos");
  revalidatePath(`/admin/artigos/${slug}/${ordem}`);
  revalidatePath("/admin/artigos/legisbot-preview");
  if (returnToPreview) redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&referencia=salva`);
  redirect(`/admin/artigos/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}?aba=artigo&referencia=salva`);
}

export async function createPreviewLegislativeReference(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const ordem = value(formData, "ordem");
  const result = await createLegislativeReferenceFromPreview({ lawSlug: slug, ordem, identification: formData.get("identification") });
  revalidatePath(`/admin/artigos/legisbot-preview`);
  redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&editar=${encodeURIComponent(result.id)}`);
}
