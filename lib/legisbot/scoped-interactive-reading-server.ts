import "server-only";

import { authenticateLawStudent, LawStudyApiError } from "@/lib/law-study-server";
import { availableLawStudyAccess } from "@/lib/law-question-scope-context";
import { tjspArticleRule } from "@/lib/tjsp-article-scope";
import { hasReviewedTjspReading, loadReviewedTjspReading } from "./tjsp-reviewed-reading-server";
import { getScopedContinuousReadingModel } from "./continuous-reading-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function scopedInteractiveReadingEnabled() {
  return process.env.LEI_INTERATIVA_ESTRUTURAS_RECORTE === "1";
}

export async function loadScopedInteractiveReading(request: Request, slug: string, query: URLSearchParams) {
  if (!scopedInteractiveReadingEnabled()) return null;
  const params = query.getAll("recorte_id");
  const id = params[0]?.toLowerCase();
  if (params.length !== 1 || !uuid.test(id ?? "")) throw new LawStudyApiError(400, "Recorte de lei inválido.");
  const enabled = new Set((process.env.LEI_INTERATIVA_RECORTES_HABILITADOS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter((value) => uuid.test(value)));
  if (!id || !enabled.has(id)) return null;
  const { supabase, lawId, law, studentId } = await authenticateLawStudent(request, slug);
  const [scope, releases, links] = await Promise.all([
    supabase.from("recortes_leis").select("id,acesso_gratuito").eq("id", id).eq("lei_id", lawId).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle(),
    supabase.from("liberacoes_leis").select("produto_id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("status", "ativo"),
    supabase.from("recortes_leis_estrutura").select("structure_id").eq("recorte_id", id).eq("lei_id", lawId),
  ]);
  if (scope.error || releases.error || links.error) throw new LawStudyApiError(503, "Não foi possível verificar o recorte agora.");
  if (!scope.data) throw new LawStudyApiError(404, "Este recorte não está disponível para estudo.");
  const grants = releases.data ?? [];
  if (scope.data.acesso_gratuito !== true && law?.acesso_gratuito !== true && !grants.some((grant) => grant.produto_id === null)) {
    const products = [...new Set(grants.map((grant) => grant.produto_id).filter((productId): productId is string => typeof productId === "string"))];
    if (!products.length) throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
    const pairs = await supabase.from("produto_leis").select("produto_id,recorte_id").eq("lei_id", lawId).in("produto_id", products);
    if (pairs.error) throw new LawStudyApiError(503, "Não foi possível verificar o recorte agora.");
    const access = availableLawStudyAccess(grants, pairs.data ?? []);
    if (!access.full && (!id || !access.recorteIds.includes(id))) throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
  }
  // Só ativar a leitura granular quando os blocos (não apenas as referências)
  // tiverem sido conferidos integralmente. Uma seção mista jamais pode vazar.
  const selected = new Set((links.data ?? []).map((row) => Number(row.structure_id)).filter((structureId) => Number.isSafeInteger(structureId) && structureId > 0));
  if (!selected.size) return null;
  if (hasReviewedTjspReading(id)) return loadReviewedTjspReading(id, slug, lawId, selected);
  if (tjspArticleRule(id)) return null;
  const model = await getScopedContinuousReadingModel(slug, selected);
  return model && model.law.id === lawId && model.integrity.readingAvailable ? model : null;
}
