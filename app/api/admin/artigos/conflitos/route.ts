import { NextResponse } from "next/server";
import {
  AdminArticleConflictError,
  applyArticleSourceStandardization,
  applyArticleGranularityBatch,
  applyArticleStructuralBatch,
  applyArticleReferenceCleanup,
  deactivateArticleConflictQuestion,
  previewArticleReferenceCleanup,
  previewArticleGranularityBatch,
  previewArticleStructuralBatch,
  previewArticleSourceStandardization,
} from "@/lib/admin-article-conflicts-server";
import { obterAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store, max-age=0" };

function failure(error: unknown) {
  if (error instanceof AdminArticleConflictError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("Falha interna na correção de conflitos de flashcards.");
  return NextResponse.json({ error: "Não foi possível concluir a correção do conflito." }, { status: 500, headers });
}

export async function POST(request: Request) {
  try {
    if (!await obterAdministrador()) throw new AdminArticleConflictError(401, "Autenticação administrativa obrigatória.");
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new AdminArticleConflictError(400, "Corpo da solicitação inválido."); }
    const slug = String(body.slug ?? "");
    const ordem = String(body.ordem ?? "");
    if (body.action === "previsualizar_padronizacao") {
      return NextResponse.json(await previewArticleSourceStandardization(slug, ordem, String(body.version_id ?? "")), { headers });
    }
    if (body.action === "aplicar_padronizacao") {
      return NextResponse.json(await applyArticleSourceStandardization({
        slug, ordem, versionId: String(body.version_id ?? ""), expected: body.expected,
        confirmation: String(body.confirmation ?? ""),
      }), { headers });
    }
    if (body.action === "inativar_flashcard") {
      return NextResponse.json(await deactivateArticleConflictQuestion(slug, ordem, String(body.question_id ?? ""), String(body.confirmation ?? "")), { headers });
    }
    if (body.action === "previsualizar_lote_estrutural") {
      return NextResponse.json(await previewArticleStructuralBatch(body.contexts), { headers });
    }
    if (body.action === "aplicar_lote_estrutural") {
      return NextResponse.json(await applyArticleStructuralBatch({ contexts: body.contexts, confirmation: String(body.confirmation ?? "") }), { headers });
    }
    if (body.action === "previsualizar_lote_granularidade") {
      return NextResponse.json(await previewArticleGranularityBatch({ contexts: body.contexts, decision: body.decision }), { headers });
    }
    if (body.action === "aplicar_lote_granularidade") {
      return NextResponse.json(await applyArticleGranularityBatch({ contexts: body.contexts, decision: body.decision }), { headers });
    }
    if (body.action === "previsualizar_limpeza_assuntos") {
      return NextResponse.json(await previewArticleReferenceCleanup(body.law), { headers });
    }
    if (body.action === "aplicar_limpeza_assuntos") {
      return NextResponse.json(await applyArticleReferenceCleanup({ law: body.law, expected: body.expected, confirmation: String(body.confirmation ?? "") }), { headers });
    }
    throw new AdminArticleConflictError(400, "Ação de conflito inválida.");
  } catch (error) {
    return failure(error);
  }
}
