import { getSupabaseServerClient } from "@/lib/supabase-server";

function token(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

async function currentUser(request: Request) {
  const accessToken = token(request);
  if (!accessToken) return null;
  const supabase = getSupabaseServerClient();
  const user = await supabase.auth.getUser(accessToken);
  return user.data.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const result = await getSupabaseServerClient().from("alunos").select("telefone").eq("user_id", user.id).maybeSingle();
  if (result.error) return Response.json({ error: "Não foi possível carregar seu perfil." }, { status: 500 });
  return Response.json({ telefone: result.data?.telefone ?? null, email: user.email ?? null });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).join(",") !== "telefone") return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const value = (body as { telefone?: unknown }).telefone;
  if (value !== null && typeof value !== "string") return Response.json({ error: "Telefone inválido." }, { status: 400 });
  const telefone = typeof value === "string" ? value.trim() : null;
  if (telefone && telefone.length > 80) return Response.json({ error: "Telefone excede o limite permitido." }, { status: 400 });
  const result = await getSupabaseServerClient().from("alunos").update({ telefone: telefone || null }).eq("user_id", user.id).select("telefone").maybeSingle();
  if (result.error || !result.data) return Response.json({ error: "Não foi possível salvar seu telefone." }, { status: 500 });
  return Response.json({ telefone: result.data.telefone });
}
