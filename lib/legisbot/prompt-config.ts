import { getSupabaseServerClient } from "@/lib/supabase-server";
import { DEFAULT_LEGISBOT_PROMPT } from "./prompt";

const KEY = "prompt_principal";

export async function getLegisBotPrompt() {
  const result = await getSupabaseServerClient().from("legisbot_configuracoes").select("valor").eq("chave", KEY).maybeSingle();
  if (result.error) return DEFAULT_LEGISBOT_PROMPT;
  return typeof result.data?.valor === "string" && result.data.valor.trim() ? result.data.valor : DEFAULT_LEGISBOT_PROMPT;
}

export async function saveLegisBotPrompt(value: string) {
  const prompt = value.trim();
  if (!prompt || prompt.length > 20_000) throw new Error("O prompt deve ter entre 1 e 20.000 caracteres.");
  const result = await getSupabaseServerClient().from("legisbot_configuracoes").upsert({ chave: KEY, valor: prompt }, { onConflict: "chave" });
  if (result.error) throw new Error("Não foi possível salvar o prompt do LegisBot.");
}
