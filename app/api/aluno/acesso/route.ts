import { getSupabaseServerClient } from "@/lib/supabase-server";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() || null : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ success: false }, { status: 401 });
  const supabase = getSupabaseServerClient();
  const user = await supabase.auth.getUser(token);
  if (user.error || !user.data.user) {
    console.error("[student-access] auth_failed", { code: user.error?.code ?? null, message: user.error?.message ?? null });
    return Response.json({ success: false }, { status: 401 });
  }
  console.info("[student-access] authenticated", { user_id: user.data.user.id });
  const result = await supabase.rpc("registrar_acesso_aluno", { p_user_id: user.data.user.id });
  if (result.error) {
    console.error("[student-access] update_failed", { user_id: user.data.user.id, code: result.error.code, message: result.error.message, details: result.error.details, hint: result.error.hint });
    return Response.json({ success: false }, { status: 500 });
  }
  const student = await supabase.from("alunos").select("id,primeiro_acesso_em,ultimo_acesso_em,total_logins").eq("user_id", user.data.user.id).maybeSingle();
  if (student.error || !student.data || result.data !== true) {
    console.error("[student-access] student_not_updated", { user_id: user.data.user.id, aluno_id: student.data?.id ?? null, code: student.error?.code ?? null, message: student.error?.message ?? null, details: student.error?.details ?? null, hint: student.error?.hint ?? null });
    return Response.json({ success: false }, { status: 409 });
  }
  console.info("[student-access] updated", { user_id: user.data.user.id, aluno_id: student.data.id, primeiro_acesso_em: student.data.primeiro_acesso_em, ultimo_acesso_em: student.data.ultimo_acesso_em, total_logins: student.data.total_logins });
  return Response.json({ success: true });
}
