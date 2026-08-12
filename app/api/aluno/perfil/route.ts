import { getSupabaseServerClient } from "@/lib/supabase-server";

const publicNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,48}[\p{L}\p{N}]$/u;

function token(request: Request) { const value = request.headers.get("authorization") ?? ""; return value.startsWith("Bearer ") ? value.slice(7).trim() : null; }
async function currentUser(request: Request) { const accessToken = token(request); if (!accessToken) return null; const user = await getSupabaseServerClient().auth.getUser(accessToken); return user.data.user ?? null; }

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const supabase = getSupabaseServerClient();
  const [student, profile] = await Promise.all([supabase.from("alunos").select("nome,telefone").eq("user_id", user.id).maybeSingle(), supabase.from("perfis_publicos").select("nome_publico").eq("id", user.id).maybeSingle()]);
  if (student.error || profile.error) return Response.json({ error: "Não foi possível carregar seu perfil." }, { status: 500 });
  return Response.json({ nome: student.data?.nome ?? null, telefone: student.data?.telefone ?? null, email: user.email ?? null, nome_publico: profile.data?.nome_publico ?? null });
}

export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  const data = body as { nome?: unknown; telefone?: unknown; nome_publico?: unknown };
  if (Object.keys(data).some((key) => !["nome", "telefone", "nome_publico"].includes(key))) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  if (data.telefone !== null && data.telefone !== undefined && typeof data.telefone !== "string") return Response.json({ error: "Telefone inválido." }, { status: 400 });
  const telefone = typeof data.telefone === "string" ? data.telefone.trim() : null;
  if (telefone && telefone.length > 80) return Response.json({ error: "Telefone excede o limite permitido." }, { status: 400 });
  const publicName = typeof data.nome_publico === "string" ? data.nome_publico.trim() || null : null;
  const name = typeof data.nome === "string" ? data.nome.trim() : null;
  if (publicName !== null && !publicNamePattern.test(publicName)) return Response.json({ error: "Use um nome público de 3 a 50 caracteres, sem símbolos especiais." }, { status: 422 });
  if (name !== null && name.length > 300) return Response.json({ error: "Nome completo excede o limite permitido." }, { status: 422 });
  const supabase = getSupabaseServerClient();
  const student = await supabase.from("alunos").update({ ...(name !== null ? { nome: name || null } : {}), telefone: telefone || null }).eq("user_id", user.id).select("nome,telefone").maybeSingle();
  if (student.error || !student.data) return Response.json({ error: "Não foi possível salvar seu telefone." }, { status: 500 });
  const profile = await supabase.from("perfis_publicos").update({ ...(publicName !== null ? { nome_publico: publicName } : {}) }).eq("id", user.id).select("nome_publico").maybeSingle();
  if (profile.error || !profile.data) return Response.json({ error: "Não foi possível salvar seu perfil." }, { status: 500 });
  return Response.json({ ...student.data, ...profile.data });
}
