import "server-only";

import { LawStudyApiError } from "@/lib/law-study-server";
import { authorizeLawQuestionScope } from "@/lib/law-question-scope-auth";
import { sortLegiscastAudiosByStructure } from "@/lib/legiscast-audio-structure";
import { legiscastAudioDisplayTitle } from "@/lib/legiscast-audio-title";
import { audiosForLegiscastScope, structureForLegiscastScope } from "@/lib/legiscast-scope";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "legiscast-audio";

export async function listAuthorizedLegiscastAudios(request: Request, slug: string) {
  const recorteId = new URL(request.url).searchParams.get("recorte_id");
  const context = await authorizeLawQuestionScope(request, slug, recorteId);
  const db = getSupabaseServerClient();
  const [audioResult, structureResult] = await Promise.all([
    db.from("legiscast_audios").select("id,titulo,descricao,duracao_segundos,ordem,storage_path,created_at,structure_id").eq("lei_id", context.lawId).eq("ativo", true),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,pdf_page").eq("lei_id", context.lawId).eq("ativo", true),
  ]);
  if (audioResult.error || structureResult.error) throw new LawStudyApiError(503, "Não foi possível carregar os áudios desta lei.");
  const structure = structureForLegiscastScope(structureResult.data ?? [], context.structureIds);
  const scopedAudios = audiosForLegiscastScope(audioResult.data ?? [], context.structureIds);
  const structureNames = new Map(structure.map((node) => [node.id, node.nome]));
  const audios = await Promise.all(sortLegiscastAudiosByStructure(scopedAudios, structure).map(async (audio) => {
    const signed = await db.storage.from(BUCKET).createSignedUrl(audio.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new LawStudyApiError(503, "Não foi possível preparar os áudios desta lei.");
    return { id: audio.id, structureId: audio.structure_id, title: legiscastAudioDisplayTitle(audio.titulo, audio.structure_id === null ? null : structureNames.get(audio.structure_id)), description: audio.descricao, durationSeconds: audio.duracao_segundos, titleGroup: audio.titleGroup, titleGroupId: audio.titleGroupId, url: signed.data.signedUrl };
  }));
  return { audios, structure, recorte: context.recorte };
}
