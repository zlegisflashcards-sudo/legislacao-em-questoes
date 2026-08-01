import OpenAI from "openai";
import { limparApresentacao } from "./clean-comment";
import {
  classificarErroOpenAI,
  type DetalhesErroOpenAI,
} from "./openai-error";
import { montarPromptLegisBot, type ContextoLegisBot } from "./prompt";

export const LEGISBOT_OPENAI_MODEL = "gpt-5.4-mini";

export class OpenAIServiceError extends Error {
  public readonly temporario: boolean;

  constructor(public readonly details: DetalhesErroOpenAI) {
    super("Falha ao gerar o comentário.");
    this.name = "OpenAIServiceError";
    this.temporario = ["rate_limit", "network"].includes(details.categoria)
      || (details.categoria === "internal" && (details.status ?? 0) >= 500);
  }
}

export async function gerarComentarioLegisBot(
  contexto: ContextoLegisBot,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIServiceError({
      categoria: "internal",
      code: "configuration_missing",
      type: "configuration_error",
      technicalMessage: "OPENAI_API_KEY não configurada no servidor.",
    });
  }

  const openai = new OpenAI({ apiKey });
  let comment: string;
  try {
    const response = await openai.responses.create(
      {
        model: LEGISBOT_OPENAI_MODEL,
        input: montarPromptLegisBot(contexto),
        temperature: 0.3,
        max_output_tokens: 1800,
      },
      { signal: AbortSignal.timeout(60_000) },
    );
    comment = limparApresentacao(response.output_text);
  } catch (error) {
    throw new OpenAIServiceError(classificarErroOpenAI(error));
  }

  if (!comment) {
    throw new OpenAIServiceError({
      categoria: "internal",
      code: "empty_response",
      type: "invalid_response",
      technicalMessage: "A OpenAI retornou uma resposta sem conteúdo.",
    });
  }

  return comment;
}
