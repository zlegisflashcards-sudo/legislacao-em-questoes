import "server-only";
import { createHash } from "node:crypto";
import { authenticateLawStudent, LawStudyApiError } from "@/lib/law-study-server";
import { hasLegalTextCore, sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { CPP_LAW_ID, CPP_PMAL_SCOPE_ID, CPP_PMAL_TITLES, cppPmalReadingHasEntitlement, cppPmalReadingHasExactTitles, isCppPmalReading, type CppPmalReadingBlock } from "./cpp-pmal-reading-policy";
import { parseCppPmalReview, type CppPmalReviewPin } from "./cpp-pmal-reading-review";

type RawBlock = { id: string; structure_id: number | null; ordem: string; identificacao: string; legislacao: string | null; preparado_em: string | null; situacao: string | null };

export function buildCppPmalReadingBlocks(rows: RawBlock[], reviewed: CppPmalReviewPin[]): CppPmalReadingBlock[] | null {
  if (rows.length !== reviewed.length) return null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const blocks: CppPmalReadingBlock[] = [];
  for (const [id, structureId, order, label, digest] of reviewed) {
    const row = byId.get(String(id));
    if (!row || row.structure_id !== structureId || row.ordem !== order || row.identificacao !== label ||
        !row.preparado_em || row.situacao === "arquivada" || !row.legislacao ||
        createHash("sha256").update(row.legislacao, "utf8").digest("hex") !== digest) return null;
    const html = sanitizeLegalHtmlCore(row.legislacao);
    if (!hasLegalTextCore(html)) return null;
    blocks.push({ id: String(id), structureId: Number(structureId), label: String(label), html });
  }
  return blocks;
}

export async function loadCppPmalReading(request: Request, slug: string, scopeId: string) {
  if (!isCppPmalReading(slug, scopeId)) throw new LawStudyApiError(404, "Recorte indisponível.");
  const { supabase, lawId, studentId } = await authenticateLawStudent(request, slug);
  if (lawId !== CPP_LAW_ID) throw new LawStudyApiError(404, "Recorte indisponível.");
  const [scope, releases] = await Promise.all([
    supabase.from("recortes_leis").select("id").eq("id", scopeId).eq("lei_id", lawId).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle(),
    supabase.from("liberacoes_leis").select("produto_id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("status", "ativo"),
  ]);
  if (scope.error || releases.error) throw new LawStudyApiError(503, "Não foi possível verificar o recorte.");
  if (!scope.data) throw new LawStudyApiError(404, "Recorte indisponível.");
  const grants = releases.data ?? [];
  const productIds: string[] = [...new Set(grants.flatMap(({ produto_id }) => typeof produto_id === "string" ? [produto_id] : []))];
  const [links, products] = productIds.length ? await Promise.all([
    supabase.from("produto_leis").select("produto_id,recorte_id").eq("lei_id", lawId).in("produto_id", productIds),
    supabase.from("produtos").select("id").in("id", productIds).eq("ativo", true),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (links.error || products.error) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso.");
  if (!cppPmalReadingHasEntitlement(grants, links.data ?? [], (products.data ?? []).map(({ id }) => String(id)))) {
    throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
  }
  const ids = CPP_PMAL_TITLES.map(({ id }) => id);
  const [selected, activeTitles] = await Promise.all([
    supabase.from("recortes_leis_estrutura").select("structure_id").eq("recorte_id", scopeId).eq("lei_id", lawId),
    supabase.from("law_structure").select("id").eq("lei_id", lawId).eq("ativo", true).in("id", ids),
  ]);
  if (selected.error || activeTitles.error) throw new LawStudyApiError(503, "Não foi possível verificar os títulos do recorte.");
  if (!cppPmalReadingHasExactTitles((selected.data ?? []).map(({ structure_id }) => Number(structure_id))) ||
      !cppPmalReadingHasExactTitles((activeTitles.data ?? []).map(({ id }) => Number(id)))) {
    throw new LawStudyApiError(409, "A Lei Interativa deste recorte está em conferência.");
  }
  const reviewed = parseCppPmalReview(process.env.CPP_PMAL_READING_REVIEW);
  if (!reviewed) throw new LawStudyApiError(409, "A Lei Interativa deste recorte está em conferência.");
  const result = await supabase.from("legislative_references").select("id,structure_id,ordem,identificacao,legislacao,preparado_em,situacao").eq("lei_id", lawId).in("structure_id", ids).or("situacao.is.null,situacao.neq.arquivada").limit(reviewed.length + 1);
  if (result.error) throw new LawStudyApiError(503, "Não foi possível carregar os artigos do recorte.");
  const blocks = buildCppPmalReadingBlocks(result.data ?? [], reviewed);
  if (!blocks) throw new LawStudyApiError(409, "A Lei Interativa deste recorte está em conferência.");
  return { blocks };
}
