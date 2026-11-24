import "server-only";

import { availableLawStudyAccess } from "@/lib/law-question-scope-context";
import { authenticateLawStudent, LawStudyApiError } from "@/lib/law-study-server";

/** A compra de um recorte não autoriza o leitor integral. */
export async function authorizeIntegralInteractiveReading(request: Request, slug: string) {
  const context = await authenticateLawStudent(request, slug);
  if (context.law?.acesso_gratuito === true) return context;
  const { data: releases, error: releaseError } = await context.supabase.from("liberacoes_leis")
    .select("produto_id").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("status", "ativo");
  if (releaseError) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
  const active = releases ?? [];
  if (active.some((item) => item.produto_id === null)) return context;
  const productIds = [...new Set(active.map((item) => item.produto_id).filter((id): id is string => typeof id === "string"))];
  if (productIds.length) {
    const { data, error } = await context.supabase.from("produto_leis")
      .select("produto_id,recorte_id").eq("lei_id", context.lawId).in("produto_id", productIds);
    if (error) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
    if (availableLawStudyAccess(active, data ?? []).full) return context;
  }
  throw new LawStudyApiError(403, "A leitura integral não está liberada para a sua conta.");
}
