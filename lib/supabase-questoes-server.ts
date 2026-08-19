import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.QUESTOES_SUPABASE_URL;
const supabaseSecretKey = process.env.QUESTOES_SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  throw new Error("QUESTOES_SUPABASE_URL não configurada.");
}

if (!supabaseSecretKey) {
  throw new Error("QUESTOES_SUPABASE_SECRET_KEY não configurada.");
}

export const supabaseQuestoes = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);