import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "no-store" };
const fail = (message: string, status: number) => Response.json({ error: message }, { status, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await obterAdministrador()) return fail("Autenticação administrativa obrigatória.", 401);
  const { id } = await params;
  if (!uuid.test(id)) return fail("Produto inválido.", 400);
  const db = getSupabaseServerClient();
  const [source, saved] = await Promise.all([
    db.from("produto_leis").select("lei_id").eq("produto_id", id),
    db.from("produto_upsells").select("recomendado_id,ordem").eq("produto_id", id).order("ordem"),
  ]);
  if (source.error || saved.error) return fail("Não foi possível carregar os upsells. Verifique se a migration foi aplicada.", 500);
  const ids = [...new Set((source.data ?? []).map((row) => row.lei_id))];
  const links = ids.length ? await db.from("produto_leis").select("produto_id").in("lei_id", ids) : { data: [], error: null };
  if (links.error) return fail("Não foi possível carregar os produtos relacionados.", 500);
  const productIds = [...new Set((links.data ?? []).map((row) => row.produto_id))];
  const products = await db.from("produtos").select("id,nome,tipo_produto,ativo").in("tipo_produto", ["edital", "combo"]).eq("ativo", true).order("nome");
  if (products.error) return fail("Não foi possível carregar os produtos relacionados.", 500);
  const suggested = new Set(productIds.map(String));
  const candidates = (products.data ?? []).map((item) => ({ ...item, suggested: suggested.has(String(item.id)) })).sort((a, b) => Number(b.suggested) - Number(a.suggested));
  const available = new Set(candidates.map((item) => String(item.id)));
  return Response.json({ candidates, selected: (saved.data ?? []).map((row) => String(row.recomendado_id)).filter((id) => available.has(id)) }, { headers });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await obterAdministrador()) return fail("Autenticação administrativa obrigatória.", 401);
  const { id } = await params;
  const body = await request.json().catch(() => null) as { selected?: unknown } | null;
  if (!uuid.test(id) || !Array.isArray(body?.selected) || body.selected.length > 100 || body.selected.some((item: unknown) => typeof item !== "string" || !uuid.test(item)) || new Set(body.selected).size !== body.selected.length) return fail("Seleção inválida.", 400);
  const result = await getSupabaseServerClient().rpc("admin_definir_produto_upsells", { p_produto_id: id, p_recomendados: body.selected });
  if (result.error) return fail("Não foi possível salvar os upsells. Verifique a categoria e os produtos selecionados.", 400);
  return Response.json({ saved: true }, { headers });
}
