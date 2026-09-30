import type { LegisBotComentario } from "../legisbot-comentario";
import { normalizeLegisBotIdentifiers, LegisBotRequestError, type LegisBotIdentifiers } from "./request-validation";
import { readLegisBotComment } from "./read-service";
import { sanitizarComentarioHtml } from "./sanitize-comment-html";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { LegisBotSourceError, type LegisBotSource } from "./source";

export async function handleLegisBotRead(
  params: { slug: string; ordem: string },
  dependencies: {
    find: (identifiers: LegisBotIdentifiers) => Promise<LegisBotComentario | null>;
    resolveSource: (identifiers: LegisBotIdentifiers) => Promise<LegisBotSource>;
    reconcileSource: (source: LegisBotSource) => Promise<LegisBotComentario | null>;
  },
): Promise<Response> {
  try {
    const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
    const source = await dependencies.resolveSource(identifiers);
    const reconciled = await dependencies.reconcileSource(source);
    const outcome = await readLegisBotComment(() => reconciled ? Promise.resolve(reconciled) : dependencies.find(identifiers));
    if (outcome.kind === "completed") {
      const item = outcome.item;
      return json({
        success: true,
        source: "database",
        status: "gerado",
        comment: sanitizarComentarioHtml(item.comentario ?? ""),
        titulo: source.titulo,
        assunto: source.assunto,
        legislacao: sanitizeLegalHtmlCore(source.legislacao),
        modelo_ia: item.modelo_ia,
        precisa_revisao: item.precisa_revisao,
      });
    }
    if (outcome.kind === "processing") {
      const item = outcome.item;
      return json({
        success: true,
        source: "processing",
        status: "pendente",
        comment: null,
        titulo: source.titulo,
        assunto: source.assunto,
        legislacao: sanitizeLegalHtmlCore(source.legislacao),
        modelo_ia: item.modelo_ia,
        precisa_revisao: item.precisa_revisao,
      }, 202);
    }
    return json({
      success: false,
      error: "Comentário ainda não disponível.",
      titulo: source.titulo,
      assunto: source.assunto,
      legislacao: sanitizeLegalHtmlCore(source.legislacao),
    }, 404);
  } catch (error) {
    if (error instanceof LegisBotSourceError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "conflict" ? 409 : error.kind === "incomplete" ? 422 : 503;
      return json({ success: false, error: error.publicMessage, reason: `source_${error.kind}` }, status);
    }
    if (error instanceof LegisBotRequestError) {
      return json({ success: false, error: error.publicMessage }, error.status);
    }
    return json({ success: false, error: "Não foi possível consultar o comentário." }, 503);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
  });
}
