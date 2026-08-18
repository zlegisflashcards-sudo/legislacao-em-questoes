import "server-only";

import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { CommunityApiError } from "@/lib/legisbot-community-server";
import { normalizeLegalText } from "@/lib/legisbot-highlights";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function getStoredLegislationText(slug: string, ordem: string) {
  const { data, error } = await getSupabaseServerClient()
    .from("legisbot_comentarios")
    .select("legislacao")
    .eq("slug", slug)
    .eq("ordem", ordem)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new CommunityApiError(404, "Trecho não encontrado.");

  const legislationText = normalizeLegalText(sanitizarHtmlLegislacao(String(data.legislacao ?? "")));
  if (!legislationText) throw new CommunityApiError(409, "O texto da legislação não está disponível para destaque.");
  return legislationText;
}

export function highlightJsonError(error: unknown) {
  if (error instanceof CommunityApiError) {
    return Response.json({ success: false, message: error.publicMessage }, { status: error.status });
  }
  console.error("Falha nos destaques pessoais do LegisBot", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json(
    { success: false, message: "Não foi possível concluir a operação no momento." },
    { status: 500 },
  );
}
