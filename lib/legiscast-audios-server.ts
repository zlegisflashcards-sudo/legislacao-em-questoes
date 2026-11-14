import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { sortLegiscastAudiosByStructure } from "@/lib/legiscast-audio-structure";
import { legiscastAudioDisplayTitle } from "@/lib/legiscast-audio-title";
import { audiosForLegiscastScope, structureForLegiscastScope } from "@/lib/legiscast-scope";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { attachConfirmedLegiscastAudioCoverage, resolveLegiscastTrackForStructure } from "@/lib/legiscast-audio-coverage-core";

const BUCKET = "legiscast-audio";

function coverageMigrationPending(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205";
}

/**
 * Retorna uma única faixa assinada para a estrutura pedida pela Lei
 * Interativa. A cobertura adicional só entra quando a tabela editorial já
 * existe; durante a janela da migration, vínculos diretos seguem disponíveis.
 */
export async function getAuthorizedLegiscastAudioForStructure(request: Request, slug: string, rawStructureId: string | null) {
  const context = await authorizeLawStudy(request, slug);
  return getLegiscastAudioForLaw(context.lawId, rawStructureId);
}

/**
 * Resolve uma única faixa por estrutura para um chamador que já confirmou o
 * acesso à lei. A autorização (comercial ou administrativa) permanece fora
 * desta função; a mesma resolução evita divergência entre os dois fluxos.
 */
export async function getLegiscastAudioForLaw(lawId: number, rawStructureId: string | null) {
  const structureId = rawStructureId === null || rawStructureId === "" ? null : /^\d+$/.test(rawStructureId) ? Number(rawStructureId) : NaN;
  if (!Number.isInteger(structureId) && structureId !== null) throw new LawStudyApiError(400, "Estrutura inválida.");
  const db = getSupabaseServerClient();
  const [tracksResult, structuresResult] = await Promise.all([
    db.from("legiscast_audios").select("id,lei_id,structure_id,titulo,descricao,duracao_segundos,storage_path").eq("lei_id", lawId).eq("ativo", true),
    db.from("law_structure").select("id,nome,audio_not_applicable").eq("lei_id", lawId).eq("ativo", true),
  ]);
  if (tracksResult.error || structuresResult.error) throw new LawStudyApiError(503, "Não foi possível consultar o áudio desta estrutura.");
  const structures = structuresResult.data ?? [];
  const requestedStructure = structureId === null ? null : structures.find((structure) => Number(structure.id) === structureId);
  if (structureId !== null && !requestedStructure) throw new LawStudyApiError(404, "Estrutura não encontrada nesta legislação.");
  if (requestedStructure?.audio_not_applicable === true) return { audio: null, status: "not_applicable" as const };
  const coverageResult = await db.from("legiscast_audio_structure_coverage").select("audio_id,structure_id,lei_id").eq("lei_id", lawId);
  if (coverageResult.error && !coverageMigrationPending(coverageResult.error)) throw new LawStudyApiError(503, "Não foi possível verificar a cobertura editorial do áudio.");
  const tracks = attachConfirmedLegiscastAudioCoverage(
    (tracksResult.data ?? []).map((track) => ({ id: String(track.id), structureId: track.structure_id === null ? null : Number(track.structure_id), active: true })),
    coverageResult.error ? [] : (coverageResult.data ?? []).map((coverage) => ({ audioId: String(coverage.audio_id), structureId: Number(coverage.structure_id) })),
  );
  const resolution = resolveLegiscastTrackForStructure({ structureId, tracks });
  if (!resolution) return { audio: null, status: "unavailable" as const };
  if ("pending" in resolution) return { audio: null, status: "ambiguous" as const };
  const row = (tracksResult.data ?? []).find((track) => String(track.id) === resolution.track.id);
  if (!row) throw new LawStudyApiError(503, "Não foi possível preparar o áudio desta estrutura.");
  const signed = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) throw new LawStudyApiError(503, "Não foi possível preparar o áudio desta estrutura.");
  return { audio: { id: String(row.id), structureId: row.structure_id === null ? null : Number(row.structure_id), title: legiscastAudioDisplayTitle(row.titulo, row.structure_id === null ? null : structures.find((structure) => Number(structure.id) === Number(row.structure_id))?.nome), description: row.descricao, durationSeconds: row.duracao_segundos, url: signed.data.signedUrl }, status: resolution.source };
}

export async function listAuthorizedLegiscastAudios(request: Request, slug: string) {
  // Áudio e PDF do LegisCast pertencem à lei completa. Recortes delimitam
  // questões e Anki, mas não reduzem o catálogo audiovisual.
  const context = await authorizeLawStudy(request, slug);
  const db = getSupabaseServerClient();
  const [audioResult, structureResult] = await Promise.all([
    db.from("legiscast_audios").select("id,titulo,descricao,duracao_segundos,ordem,storage_path,created_at,structure_id").eq("lei_id", context.lawId).eq("ativo", true),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,pdf_page").eq("lei_id", context.lawId).eq("ativo", true),
  ]);
  if (audioResult.error || structureResult.error) throw new LawStudyApiError(503, "Não foi possível carregar os áudios desta lei.");
  const structure = structureForLegiscastScope(structureResult.data ?? [], null);
  const scopedAudios = audiosForLegiscastScope(audioResult.data ?? [], null);
  const structureNames = new Map(structure.map((node) => [node.id, node.nome]));
  const audios = await Promise.all(sortLegiscastAudiosByStructure(scopedAudios, structure).map(async (audio) => {
    const signed = await db.storage.from(BUCKET).createSignedUrl(audio.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) throw new LawStudyApiError(503, "Não foi possível preparar os áudios desta lei.");
    return { id: audio.id, structureId: audio.structure_id, title: legiscastAudioDisplayTitle(audio.titulo, audio.structure_id === null ? null : structureNames.get(audio.structure_id)), description: audio.descricao, durationSeconds: audio.duracao_segundos, titleGroup: audio.titleGroup, titleGroupId: audio.titleGroupId, url: signed.data.signedUrl };
  }));
  return { audios, structure, recorte: null };
}
