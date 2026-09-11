export function legiscastAudioDisplayTitle(title: string | null | undefined, structureName?: string | null) {
  return title?.trim() || structureName?.trim() || "Áudio";
}
