import OpenAI from "openai";
import { limparApresentacao } from "./clean-comment";
import { montarPromptLegisBot, type ContextoLegisBot } from "./prompt";

export const LEGISBOT_OPENAI_MODEL = "gpt-5.4-mini";

export class OpenAIServiceError extends Error {
  constructor(public readonly temporario: boolean) {
    super("Falha ao gerar o comentário.");
    this.name = "OpenAIServiceError";
  }
}

export async function gerarComentarioLegisBot(
  contexto: ContextoLegisBot,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIServiceError(false);
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
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    throw new OpenAIServiceError(
      status === undefined || status === 408 || status === 429 || status >= 500,
    );
  }

  if (!comment) {
    throw new OpenAIServiceError(true);
  }

  return comment;
}
