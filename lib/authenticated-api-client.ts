import { supabase } from "@/lib/supabase";

export async function protectedApiHeaders(extra: Record<string, string> = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}
