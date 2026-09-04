import { LEGISCAST_FINAL_MAX_BYTES, formatLegiscastAudioSize } from "@/lib/legiscast-audio-processing";

// O bucket aceita 100 MiB, mas o limite global efetivo do projeto é 50 MiB.
export const LEGISCAST_AUDIO_MAX_BYTES = LEGISCAST_FINAL_MAX_BYTES;
export const LEGISCAST_AUDIO_MAX_MB = 50;
export { formatLegiscastAudioSize };
