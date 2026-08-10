import { getSupabaseServerClient } from "@/lib/supabase-server";

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

export async function GET(request: Request) {
  const token = bearer(request);
  if (!token) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const supabase = getSupabaseServerClient();
  const user = await supabase.auth.getUser(token);
  if (user.error || !user.data.user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const aluno = await supabase.from("alunos").select("deve_trocar_senha").eq("user_id", user.data.user.id).maybeSingle();
  if (aluno.error) return Response.json({ error: "Não foi possível consultar o acesso." }, { status: 500 });
  return Response.json({ deve_trocar_senha: aluno.data?.deve_trocar_senha === true });
}

export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const supabase = getSupabaseServerClient();
  const user = await supabase.auth.getUser(token);
  if (user.error || !user.data.user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const updated = await supabase.from("alunos").update({ deve_trocar_senha: false }).eq("user_id", user.data.user.id).eq("deve_trocar_senha", true);
  if (updated.error) return Response.json({ error: "Não foi possível concluir a troca de senha." }, { status: 500 });
  return Response.json({ success: true });
}
