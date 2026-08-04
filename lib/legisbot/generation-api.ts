import type { User } from "@supabase/supabase-js";
import { requestLegisBotGeneration } from "./generation-service";
import { GenerationRepositoryError, type LegisBotGenerationRepository } from "./generation-repository-types";
import {
  LegisBotRequestError,
  normalizeLegisBotIdentifiers,
  readLegisBotGenerationBody,
  validateLegisBotRequestOrigin,
} from "./request-validation";
import { sanitizarComentarioHtml } from "./sanitize-comment-html";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import type { DetalhesErroOpenAI } from "./openai-error";

type GenerationApiDependencies = {
  authenticate: (request: Request) => Promise<User | null>;
  getRepository: () => LegisBotGenerationRepository;
  generate?: Parameters<typeof requestLegisBotGeneration>[0]["generate"];
  alertQuota?: (
    context: { slug: string; ordem: string; titulo?: string; assunto?: string },
    details: DetalhesErroOpenAI,
  ) => Promise<unknown>;
  logError?: (message: string) => void;
};

export async function handleLegisBotGenerationPost(
  request: Request,
  params: { slug: string; ordem: string },
  dependencies: GenerationApiDependencies,
): Promise<Response> {
  try {
    validateLegisBotRequestOrigin(request);
    const user = await dependencies.authenticate(request);
    if (!user) return json({ success: false, error: "Entre na sua conta para gerar o comentário." }, 401);

    const identifiers = normalizeLegisBotIdentifiers(params.slug, params.ordem);
    const input = await readLegisBotGenerationBody(request);
    const outcome = await requestLegisBotGeneration(
      {
        repository: dependencies.getRepository(),
        generate: dependencies.generate,
        alertQuota: dependencies.alertQuota,
      },
      user.id,
      identifiers,
      input,
    );

    if (outcome.kind === "generated" || outcome.kind === "completed") {
      return json({
        success: true,
        source: outcome.kind === "generated" ? "generated" : "database",
        status: "gerado",
        comment: sanitizarComentarioHtml(outcome.comment),
        titulo: outcome.item.titulo,
        assunto: outcome.item.assunto,
        legislacao: sanitizeLegalHtmlCore(outcome.item.legislacao),
        modelo_ia: outcome.item.modelo_ia,
      });
    }
    if (outcome.kind === "processing") {
      return json({ success: true, source: "processing", status: "pendente", comment: null }, 202);
    }
    if (outcome.kind === "rate_limited" || outcome.kind === "cooldown") {
      return json({
        success: false,
        error: outcome.kind === "rate_limited"
          ? "Você atingiu o limite temporário de solicitações. Tente novamente mais tarde."
          : "Aguarde alguns minutos antes de tentar novamente.",
        reason: outcome.kind,
      }, 429, outcome.retryAfter);
    }
    if (outcome.kind === "attempts_exhausted") {
      return json({
        success: false,
        error: "Este comentário precisa de revisão antes de uma nova tentativa.",
        reason: "attempts_exhausted",
      }, 409);
    }
    if (outcome.kind === "quota") {
      return json({
        success: false,
        error: "O LegisBot está descansando um pouco. Tente novamente mais tarde.",
        reason: "legisbot_resting",
      }, 503);
    }
    return json({ success: false, error: "Não foi possível gerar o comentário no momento." },
      outcome.kind === "temporary_failure" ? 503 : 500);
  } catch (error) {
    if (error instanceof LegisBotRequestError) {
      return json({ success: false, error: error.publicMessage, reason: error.reason }, error.status);
    }
    if (error instanceof GenerationRepositoryError && error.invalidInput) {
      return json({ success: false, error: "Os dados do trecho estão incompletos ou inválidos." }, 400);
    }
    dependencies.logError?.("Falha ao processar solicitação autenticada.");
    return json({ success: false, error: "Não foi possível processar a solicitação." }, 500);
  }
}

function json(body: unknown, status = 200, retryAfter: string | null = null) {
  const headers: Record<string, string> = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  if (retryAfter) {
    const seconds = Math.max(1, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000));
    headers["Retry-After"] = String(seconds);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
