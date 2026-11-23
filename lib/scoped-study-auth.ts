import "server-only";

import { authenticateLawStudent, LawStudyApiError } from "@/lib/law-study-server";
import { availableLawStudyAccess } from "@/lib/law-question-scope-context";
import { descendantsForScope } from "@/lib/law-question-scope-resolution";
import { collectPages } from "@/lib/law-question-pagination";

type Structure = { id: number; parent_id: number | null };

export async function authorizeScopedStudy(request: Request, slug: string, recorteId: string) {
  const context = await authenticateLawStudent(request, slug);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(recorteId)) {
    throw new LawStudyApiError(400, "Recorte de lei inválido.");
  }
  const db = context.supabase;
  const scope = await db.from("recortes_leis").select("id,nome,acesso_gratuito")
    .eq("lei_id", context.lawId).eq("id", recorteId).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
  if (scope.error) throw new LawStudyApiError(503, "Não foi possível verificar a liberação do recorte.");
  const denied = () => new LawStudyApiError(403, "Este recorte não está disponível para sua conta.");
  if (!scope.data) throw denied();
  const scopeRow = scope.data;
  if (scopeRow.acesso_gratuito !== true) {
    const releases = await db.from("liberacoes_leis").select("produto_id").eq("aluno_id", context.studentId)
      .eq("lei_id", context.lawId).eq("status", "ativo");
    if (releases.error) throw new LawStudyApiError(503, "Não foi possível verificar a liberação do recorte.");
    const active = releases.data ?? [];
    const ids = [...new Set(active.flatMap((row) => typeof row.produto_id === "string" ? [row.produto_id] : []))];
    const links = ids.length ? await db.from("produto_leis").select("produto_id,recorte_id").eq("lei_id", context.lawId)
      .in("produto_id", ids) : { data: [], error: null };
    if (links.error) throw new LawStudyApiError(503, "Não foi possível verificar a liberação do recorte.");
    const access = availableLawStudyAccess(active, links.data ?? []);
    if (!access.full && !access.recorteIds.includes(scopeRow.id)) throw denied();
  }
  const unavailable = () => new LawStudyApiError(503, "Não foi possível verificar a estrutura do recorte.");
  const [structures, roots] = await Promise.all([
    collectPages<Structure>(async (from, to) => {
      const result = await db.from("law_structure").select("id,parent_id").eq("lei_id", context.lawId).eq("ativo", true).order("id").range(from, to);
      if (result.error) throw unavailable();
      return result.data ?? [];
    }, 200),
    collectPages<{ structure_id: number }>(async (from, to) => {
      const result = await db.from("recortes_leis_estrutura").select("structure_id").eq("lei_id", context.lawId)
        .eq("recorte_id", scopeRow.id).order("structure_id").range(from, to);
      if (result.error) throw unavailable();
      return result.data ?? [];
    }, 200),
  ]);
  const active = new Set(structures.map(({ id }) => id));
  const structureIds = descendantsForScope(structures, roots.map(({ structure_id }) => structure_id).filter((id) => active.has(id)));
  if (!structureIds.length) throw denied();
  return { ...context, recorte: { id: scopeRow.id, nome: scopeRow.nome }, structureIds, structures };
}
