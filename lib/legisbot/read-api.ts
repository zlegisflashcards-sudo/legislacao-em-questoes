import type { LegisBotComentario } from "../legisbot-comentario";
import { normalizeLegisBotIdentifiers, LegisBotRequestError, type LegisBotIdentifiers } from "./request-validation";
import { readLegisBotComment } from "./read-service";
import { sanitizarComentarioHtml } from "./sanitize-comment-html";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { LegisBotSourceError, type LegisBotSource } from "./source";

export async function handleLegisBotRead(
  params: { slug: string; ordem: string },
  dependencies: {
    find: (identifiers: LegisBotIdentifiers, referenceId?: string) => Promise<LegisBotComentario | null>;
    resolveSource: (identifiers: LegisBotIdentifiers) => Promise<LegisBotSource>;
    reconcileSource?: (source: LegisBotSource) => Promise<LegisBotComentario | null>;
    reportIssue?: (input: { identifiers: LegisBotIdentifiers; type: "vinculacao" | "sem_conteudo" | "legislacao_ausente" | "falha_tecnica" }) => Promise<unknown>;
  },
): Promise<Response> {
  try {
    const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
    const source = await dependencies.resolveSource(identifiers);
    const outcome = await readLegisBotComment(() => dependencies.find(identifiers, source.referenceId ?? undefined));
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
    await dependencies.reportIssue?.({ identifiers, type: "sem_conteudo" });
    return json({ success: false, error: "Conteúdo indisponível no momento.", titulo: source.titulo, assunto: source.assunto, legislacao: sanitizeLegalHtmlCore(source.legislacao) }, 404);
  } catch (error) {
    if (error instanceof LegisBotSourceError) {
      const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
      await dependencies.reportIssue?.({ identifiers, type: error.kind === "incomplete" ? "legislacao_ausente" : error.kind === "not_found" ? "vinculacao" : "falha_tecnica" });
      const status = error.kind === "not_found" ? 404 : error.kind === "conflict" ? 409 : error.kind === "incomplete" ? 422 : 503;
      return json({ success: false, error: "Conteúdo indisponível no momento.", reason: `source_${error.kind}` }, status);
    }
    if (error instanceof LegisBotRequestError) {
      return json({ success: false, error: error.publicMessage }, error.status);
    }
    try {
      const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
      await dependencies.reportIssue?.({ identifiers, type: "falha_tecnica" });
    } catch {
      // The public response must remain available even if reporting also fails.
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
