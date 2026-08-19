import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Legis Questões é parte do projeto principal. O alias evita uma segunda
 * configuração e mantém todos os acessos server-side no Supabase oficial.
 */
export const supabaseQuestoes = getSupabaseServerClient();
