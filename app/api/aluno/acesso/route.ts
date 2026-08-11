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
  if (user.error || !user.data.user) return Response.json({ success: false }, { status: 401 });
  const result = await supabase.rpc("registrar_acesso_aluno", { p_user_id: user.data.user.id });
  if (result.error) return Response.json({ success: false }, { status: 500 });
  return Response.json({ success: result.data === true });
}
