import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const items = new Set(["estrutura", "materiais", "legiscast", "anki"]);
const headers = { "Cache-Control": "no-store, max-age=0" };
function parseLawId(value: unknown) { const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function failure(message: string, status = 400) { return Response.json({ error: message }, { status, headers }); }

export async function GET(request: Request) {
  if (!await obterAdministrador()) return failure("Autenticação administrativa obrigatória.", 401);
  const lawId = parseLawId(new URL(request.url).searchParams.get("lawId"));
  if (!lawId) return failure("Lei inválida.");
  const result = await getSupabaseServerClient().from("admin_law_overview_checks").select("item").eq("lei_id", lawId);
  if (result.error) return failure("Não foi possível carregar as marcações administrativas.", 500);
  return Response.json({ completed: (result.data ?? []).map((row) => row.item) }, { headers });
}

export async function PUT(request: Request) {
  const admin = await obterAdministrador();
  if (!admin) return failure("Autenticação administrativa obrigatória.", 401);
  const body = await request.json().catch(() => null) as { lawId?: unknown; item?: unknown; completed?: unknown } | null;
  const lawId = parseLawId(body?.lawId); const item = typeof body?.item === "string" ? body.item : "";
  if (!lawId || !items.has(item) || typeof body?.completed !== "boolean") return failure("Marcação administrativa inválida.");
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id").eq("id", lawId).maybeSingle();
  if (law.error) return failure("Não foi possível validar a lei.", 500);
  if (!law.data) return failure("Lei não encontrada.", 404);
  const result = body.completed
    ? await db.from("admin_law_overview_checks").upsert({ lei_id: lawId, item, completed_at: new Date().toISOString(), completed_by: admin.id }, { onConflict: "lei_id,item" })
    : await db.from("admin_law_overview_checks").delete().eq("lei_id", lawId).eq("item", item);
  if (result.error) return failure("Não foi possível salvar a marcação administrativa.", 500);
  return Response.json({ completed: body.completed }, { headers });
}
