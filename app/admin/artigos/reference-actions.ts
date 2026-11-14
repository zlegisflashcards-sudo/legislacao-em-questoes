"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { archiveLegislativeReference, changeLegislativeReferenceOrder, clearLegislativeReferences, importQuestionLegislationToReferences, repairLegislativeReferenceIdentifiers, resolveLegislativeReferenceShadow, saveLegislativeReference, seedLegislativeReferences, setLegislativeReferenceInactive } from "@/lib/admin-legislative-references";
import { confirmSuggestedLegislativeReferenceStructureAssociations, setAdminLegislativeReferenceStructureAssociation } from "@/lib/admin-legislative-reference-structures";
import { confirmAndReleaseLegislativeStructure, LegislativeStructureReleaseError, setAdminLegislativeStructureRelease } from "@/lib/admin-legislative-structure-releases";

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

export async function setPreparedLegislativeReferenceInactive(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const orderDirection = value(formData, "ordem_sort") === "desc" ? "desc" : "asc";
  await setLegislativeReferenceInactive({ id: value(formData, "id"), inactive: value(formData, "inactive") === "1" });
  revalidatePath("/admin/artigos");
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&ordem_sort=${orderDirection}&inativo=${value(formData, "inactive") === "1" ? "marcado" : "revertido"}`);
}

export async function archivePreparedLegislativeReference(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const orderDirection = value(formData, "ordem_sort") === "desc" ? "desc" : "asc";
  await archiveLegislativeReference({ id: value(formData, "id") });
  revalidatePath("/admin/artigos");
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&ordem_sort=${orderDirection}&base=bloco_excluido`);
}

export async function changePreparedLegislativeReferenceOrder(formData: FormData) {
  const result = await changeLegislativeReferenceOrder({ id: value(formData, "id"), ordem: value(formData, "ordem") });
  revalidatePath("/admin/artigos");
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos/${encodeURIComponent(result.slug)}/${encodeURIComponent(result.ordem)}?aba=artigo&ordem_alterada=1`);
}

/** Confirma (ou remove) o vínculo editorial do bloco com a estrutura da própria lei. */
export async function savePreparedLegislativeReferenceStructureAssociation(formData: FormData) {
  const result = await setAdminLegislativeReferenceStructureAssociation({
    referenceId: value(formData, "id"),
    structureId: value(formData, "structure_id") || null,
  });
  const slug = value(formData, "slug").toLowerCase();
  const ordem = value(formData, "ordem");
  revalidatePath("/admin/artigos");
  revalidatePath(`/admin/artigos/${slug}/${ordem}`);
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}?aba=artigo&estrutura_referencia=${result.structureId === null ? "removida" : "salva"}`);
}

/** Confirma em lote somente as sugestões unânimes; exceções permanecem para edição individual. */
export async function confirmSuggestedLegislativeReferenceStructures(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const result = await confirmSuggestedLegislativeReferenceStructureAssociations({ lawSlug: slug, structureId: value(formData, "structure_id") });
  revalidatePath("/admin/artigos");
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&associacoes_confirmadas=${result.confirmed}&associacoes_ignoradas=${result.skipped}`);
}


export async function resolvePreparedLegislativeShadow(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const ordem = value(formData, "ordem");
  const result = await resolveLegislativeReferenceShadow({ lawSlug: slug, ordem, resolution: value(formData, "resolution"), revokingLaw: formData.get("revoking_law") });
  revalidatePath("/admin/artigos");
  revalidatePath("/admin/artigos/legisbot-preview");
  redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&filtro=sombra&sombra=${result.resolution === "revogada" ? "revogado" : "criado"}`);
}

export async function setLegislativeStructureRelease(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const structureId = value(formData, "structure_id");
  const action = value(formData, "release_action");
  let result: Awaited<ReturnType<typeof setAdminLegislativeStructureRelease>>;
  try {
    result = await setAdminLegislativeStructureRelease({ lawSlug: slug, structureId, action, integrityFingerprint: value(formData, "integrity_fingerprint") });
    revalidatePath("/admin/artigos/legisbot-preview");
  } catch (error) {
    const message = error instanceof LegislativeStructureReleaseError ? error.code : "database";
    redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&liberacao_erro=${encodeURIComponent(message)}`);
  }
  redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&liberacao=${result.changed ? result.status === "released" ? "liberada" : "bloqueada" : "sem_alteracao"}`);
}

export async function confirmAndReleaseLegislativeStructureAction(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  const structureId = value(formData, "structure_id");
  let result: Awaited<ReturnType<typeof confirmAndReleaseLegislativeStructure>>;
  try {
    result = await confirmAndReleaseLegislativeStructure({ lawSlug: slug, structureId, referenceIds: formData.getAll("reference_id") });
    revalidatePath("/admin/artigos/legisbot-preview");
  } catch (error) {
    const code = error instanceof LegislativeStructureReleaseError ? error.code : "database";
    redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(structureId)}&confirmacao_erro=${encodeURIComponent(code)}`);
  }
  redirect(`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(structureId)}&confirmacao_liberada=${result.associated}`);
}
