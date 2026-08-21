import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getSupabaseQuestoesClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.QUESTOES_SUPABASE_URL;
  const secret = process.env.QUESTOES_SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Configuração do Supabase de Questões indisponível no servidor.");
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}

/** Cliente do banco separado de Questões; a configuração é lida apenas em runtime. */
export const supabaseQuestoes = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const value = Reflect.get(getSupabaseQuestoesClient(), property);
    return typeof value === "function" ? value.bind(getSupabaseQuestoesClient()) : value;
  },
});
