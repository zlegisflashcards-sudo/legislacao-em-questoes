import { getSupabaseServerClient } from "@/lib/supabase-server";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() || null : null;
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return Response.json({ success: false }, { status: 401 });
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return Response.json({ success: false }, { status: 401 });
  const { error: linkError } = await supabase.rpc("vincular_aluno_para_usuario", {
    p_user_id: data.user.id, p_email: data.user.email,
    p_nome: data.user.user_metadata?.nome ?? data.user.user_metadata?.name ?? null,
  });
  if (linkError) {
    console.error("Não foi possível vincular a conta ao aluno:", linkError.message);
    return Response.json({ success: false }, { status: 500 });
  }
  return Response.json({ success: true });
}
