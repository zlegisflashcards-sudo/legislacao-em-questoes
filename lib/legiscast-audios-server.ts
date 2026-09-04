import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "legiscast-audio";

export async function listAuthorizedLegiscastAudios(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const db = getSupabaseServerClient();
  const { data, error } = await db.from("legiscast_audios").select("id,titulo,descricao,duracao_segundos,ordem,storage_path").eq("lei_id", context.lawId).eq("ativo", true).order("ordem").order("created_at");
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar os áudios desta lei.");
  const audios = await Promise.all((data ?? []).map(async (audio) => {
    const signed = await db.storage.from(BUCKET).createSignedUrl(audio.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new LawStudyApiError(503, "Não foi possível preparar os áudios desta lei.");
    return { id: audio.id, title: audio.titulo, description: audio.descricao, durationSeconds: audio.duracao_segundos, url: signed.data.signedUrl };
  }));
  return { audios };
}
