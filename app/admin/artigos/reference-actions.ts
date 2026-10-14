"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveLegislativeReference, seedLegislativeReferences } from "@/lib/admin-legislative-references";

const value = (formData: FormData, field: string) => String(formData.get(field) ?? "").trim();

export async function prepareLegislativeReferences(formData: FormData) {
  const slug = value(formData, "slug").toLowerCase();
  await seedLegislativeReferences(slug);
  revalidatePath("/admin/artigos");
  redirect(`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}&preparacao=concluida`);
}

export async function savePreparedLegislativeReference(formData: FormData) {
  await saveLegislativeReference({
    id: value(formData, "id"),
    identification: formData.get("identification"),
    legislation: formData.get("legislation"),
  });
  const slug = value(formData, "slug").toLowerCase();
  const ordem = value(formData, "ordem");
  revalidatePath("/admin/artigos");
  revalidatePath(`/admin/artigos/${slug}/${ordem}`);
  redirect(`/admin/artigos/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}?aba=artigo&referencia=salva`);
}
