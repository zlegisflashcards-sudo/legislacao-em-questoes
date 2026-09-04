/**
 * Limites do fluxo de processamento do LegisCast.
 * O original fica temporariamente no Cloud Storage; somente o resultado entra
 * no Supabase Storage, cujo limite efetivo atual é de 50 MiB.
 */
export const LEGISCAST_ORIGINAL_MAX_BYTES = 500 * 1024 * 1024;
export const LEGISCAST_FINAL_MAX_BYTES = 50 * 1024 * 1024;
export const LEGISCAST_ORIGINAL_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const LEGISCAST_MAX_ATTEMPTS = 3;

export const LEGISCAST_ORIGINAL_TYPES = new Map<string, readonly string[]>([
  ["mp3", ["audio/mpeg"]],
  ["m4a", ["audio/mp4", "audio/x-m4a"]],
  ["wav", ["audio/wav", "audio/x-wav", "audio/wave"]],
]);

export function extensionOfLegiscastAudio(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() ?? "";
}

export function isAcceptedLegiscastOriginal(fileName: string, mime: string) {
  const accepted = LEGISCAST_ORIGINAL_TYPES.get(extensionOfLegiscastAudio(fileName));
  return Boolean(accepted?.includes(mime.toLowerCase()));
}

export function formatLegiscastAudioSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
