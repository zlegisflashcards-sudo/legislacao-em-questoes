import "server-only";
import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";

export async function authorizeLawQuestionScope(request: Request, slug: string, recorteId: string | null) {
  const context = await authorizeLawStudy(request, slug);
  if (!recorteId) return { ...context, recorte: null as null };
  if (!/^[0-9a-f-]{36}$/i.test(recorteId)) throw new LawStudyApiError(400, "Recorte de lei inválido.");
  const scope = await context.supabase.from("recortes_leis").select("id,nome").eq("id", recorteId).eq("lei_id", context.lawId).eq("ativo", true).maybeSingle();
  if (scope.error || !scope.data) throw new LawStudyApiError(404, "Recorte de lei indisponível.");
  const releases = await context.supabase.from("liberacoes_leis").select("produto_id").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("status", "ativo");
  if (releases.error) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
  const productIds = (releases.data ?? []).map((item) => item.produto_id).filter((item): item is string => typeof item === "string");
  const full = (releases.data ?? []).some((item) => item.produto_id === null);
  const links = productIds.length ? await context.supabase.from("produto_leis").select("recorte_id").eq("lei_id", context.lawId).in("produto_id", productIds) : { data: [], error: null };
  if (links.error || !(full || (links.data ?? []).some((item) => item.recorte_id === null || item.recorte_id === recorteId))) throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
  return { ...context, recorte: { id: scope.data.id, nome: scope.data.nome } };
}
