import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() || null : null;
}

/** Resolve o aluno autenticado para qualquer endpoint de ranking. */
export async function studentIdFromRankingRequest(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  const supabase = getSupabaseServerClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return null;
  const { data: student } = await supabase.from("alunos").select("id").eq("user_id", userData.user.id).maybeSingle();
  return typeof student?.id === "string" ? student.id : null;
}
