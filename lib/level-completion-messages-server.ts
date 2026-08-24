import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type LevelCompletionMessage = {
  id: number;
  texto: string;
  ordem: number;
};

export const LEVEL_COMPLETION_MESSAGES_CACHE_TAG = "level-completion-messages";

const loadActiveLevelCompletionMessages = unstable_cache(async (): Promise<LevelCompletionMessage[]> => {
  const { data, error } = await getSupabaseServerClient()
    .from("mensagens_conclusao_niveis")
    .select("id,texto,ordem")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []).filter((item) => typeof item.texto === "string" && item.texto.trim() !== "").map((item) => ({
    id: Number(item.id),
    texto: item.texto,
    ordem: Number(item.ordem),
  }));
}, ["active-level-completion-messages"], { revalidate: 300, tags: [LEVEL_COMPLETION_MESSAGES_CACHE_TAG] });

/** Falhas de configuração nunca impedem a transição de nível; o player usa o fallback local. */
export async function getActiveLevelCompletionMessages(): Promise<string[]> {
  try {
    return (await loadActiveLevelCompletionMessages()).map((item) => item.texto);
  } catch {
    return [];
  }
}

export function invalidateLevelCompletionMessagesCache() {
  revalidateTag(LEVEL_COMPLETION_MESSAGES_CACHE_TAG);
}
