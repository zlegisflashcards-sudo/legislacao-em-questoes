import type { LegisBotComentario } from "../legisbot-comentario";
import { normalizeLegisBotIdentifiers, LegisBotRequestError, type LegisBotIdentifiers } from "./request-validation";
import { readLegisBotComment } from "./read-service";
import { sanitizarComentarioHtml } from "./sanitize-comment-html";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";

export async function handleLegisBotRead(
  params: { slug: string; ordem: string },
  find: (identifiers: LegisBotIdentifiers) => Promise<LegisBotComentario | null>,
): Promise<Response> {
  try {
    const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
    const outcome = await readLegisBotComment(() => find(identifiers));
    if (outcome.kind === "completed") {
      const item = outcome.item;
      return json({
        success: true,
        source: "database",
        status: "gerado",
        comment: sanitizarComentarioHtml(item.comentario ?? ""),
        titulo: item.titulo,
        assunto: item.assunto,
        legislacao: sanitizeLegalHtmlCore(item.legislacao),
        modelo_ia: item.modelo_ia,
      });
    }
    if (outcome.kind === "processing") {
      const item = outcome.item;
      return json({
        success: true,
        source: "processing",
        status: "pendente",
        comment: null,
        titulo: item.titulo,
        assunto: item.assunto,
        legislacao: sanitizeLegalHtmlCore(item.legislacao),
        modelo_ia: item.modelo_ia,
      }, 202);
    }
    return json({ success: false, error: "Comentário ainda não disponível." }, 404);
  } catch (error) {
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
