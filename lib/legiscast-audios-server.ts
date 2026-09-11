import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { sortLegiscastAudiosByStructure } from "@/lib/legiscast-audio-structure";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "legiscast-audio";

export async function listAuthorizedLegiscastAudios(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const db = getSupabaseServerClient();
  const [audioResult, structureResult] = await Promise.all([
    db.from("legiscast_audios").select("id,titulo,descricao,duracao_segundos,ordem,storage_path,created_at,structure_id").eq("lei_id", context.lawId).eq("ativo", true),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,pdf_page").eq("lei_id", context.lawId).eq("ativo", true),
  ]);
  if (audioResult.error || structureResult.error) throw new LawStudyApiError(503, "Não foi possível carregar os áudios desta lei.");
  const audios = await Promise.all(sortLegiscastAudiosByStructure(audioResult.data ?? [], structureResult.data ?? []).map(async (audio) => {
    const signed = await db.storage.from(BUCKET).createSignedUrl(audio.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new LawStudyApiError(503, "Não foi possível preparar os áudios desta lei.");
    return { id: audio.id, structureId: audio.structure_id, title: audio.titulo, description: audio.descricao, durationSeconds: audio.duracao_segundos, titleGroup: audio.titleGroup, titleGroupId: audio.titleGroupId, url: signed.data.signedUrl };
  }));
  return { audios, structure: structureResult.data ?? [] };
}
