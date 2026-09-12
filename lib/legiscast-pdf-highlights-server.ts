import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { isPdfHighlightAnchor, type PdfHighlight } from "@/lib/legiscast-pdf-highlight";

function token(request: Request) { const header = request.headers.get("authorization") ?? ""; return header.startsWith("Bearer ") ? header.slice(7).trim() : ""; }
function materialId(value: string) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new LawStudyApiError(400, "Material inválido."); return parsed; }

async function context(request: Request, slug: string, rawMaterialId: string) {
  const access = await authorizeLawStudy(request, slug);
  const id = materialId(rawMaterialId);
  const material = await getSupabaseServerClient().from("materiais_leis").select("id").eq("id", id).eq("lei_id", access.lawId).eq("tipo", "pdf").eq("ativo", true).maybeSingle();
  if (material.error) throw new LawStudyApiError(503, "Não foi possível verificar o material agora.");
  if (!material.data) throw new LawStudyApiError(404, "Material não encontrado.");
  return { id, user: createSupabaseUserClient(token(request)) };
}

function highlight(row: Record<string, unknown>): PdfHighlight {
  return { id: String(row.id), page: Number(row.page), selectedText: String(row.selected_text), anchor: row.anchor_data as PdfHighlight["anchor"] };
}

export async function listPdfHighlights(request: Request, slug: string, rawMaterialId: string) {
  const { id, user } = await context(request, slug, rawMaterialId);
  const result = await user.from("pdf_highlights").select("id,page,selected_text,anchor_data").eq("material_id", id).order("page").order("created_at");
  if (result.error) throw new LawStudyApiError(503, "Não foi possível carregar seus destaques agora.");
  return (result.data ?? []).filter((row) => isPdfHighlightAnchor(row.anchor_data)).map((row) => highlight(row));
}

export async function createPdfHighlight(request: Request, slug: string, rawMaterialId: string, input: unknown) {
  const { id, user } = await context(request, slug, rawMaterialId);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const page = Number(body.page); const selectedText = String(body.selectedText ?? "").trim(); const anchor = body.anchor;
  if (!Number.isSafeInteger(page) || page < 1 || !selectedText || selectedText.length > 5000 || !isPdfHighlightAnchor(anchor)) throw new LawStudyApiError(400, "Destaque inválido.");
  const auth = await user.auth.getUser(); const userId = auth.data.user?.id;
  if (!userId) throw new LawStudyApiError(401, "Sua sessão expirou. Entre novamente.");
  const result = await user.from("pdf_highlights").insert({ user_id: userId, material_id: id, page, selected_text: selectedText, anchor_data: anchor }).select("id,page,selected_text,anchor_data").single();
  if (result.error) throw new LawStudyApiError(503, "Não foi possível salvar o destaque agora.");
  return highlight(result.data);
}

export async function deletePdfHighlight(request: Request, slug: string, rawMaterialId: string, highlightId: string) {
  const { id, user } = await context(request, slug, rawMaterialId);
  if (!/^[0-9a-f-]{36}$/i.test(highlightId)) throw new LawStudyApiError(400, "Destaque inválido.");
  const result = await user.from("pdf_highlights").delete().eq("id", highlightId).eq("material_id", id).select("id").maybeSingle();
  if (result.error) throw new LawStudyApiError(503, "Não foi possível remover o destaque agora.");
  if (!result.data) throw new LawStudyApiError(404, "Destaque não encontrado.");
}
