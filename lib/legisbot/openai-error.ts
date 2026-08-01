export type CategoriaErroOpenAI =
  | "quota"
  | "rate_limit"
  | "network"
  | "context_length"
  | "internal";

export type DetalhesErroOpenAI = {
  categoria: CategoriaErroOpenAI;
  status?: number;
  code?: string;
  type?: string;
  technicalMessage: string;
};

function propriedadeTexto(error: unknown, nome: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const valor = (error as Record<string, unknown>)[nome];
  return typeof valor === "string" && valor.trim() ? valor.trim() : undefined;
}

function propriedadeNumero(error: unknown, nome: string): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const valor = (error as Record<string, unknown>)[nome];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

export function classificarErroOpenAI(error: unknown): DetalhesErroOpenAI {
  const status = propriedadeNumero(error, "status");
  const code = propriedadeTexto(error, "code");
  const type = propriedadeTexto(error, "type");
  const technicalMessage =
    propriedadeTexto(error, "message") ?? "Erro não identificado retornado pela OpenAI.";
  const identificador = `${code ?? ""} ${type ?? ""}`.toLowerCase();
  const mensagem = technicalMessage.toLowerCase();

  const faltaDeCredito =
    /(^|\s)(insufficient_quota|billing_hard_limit_reached|billing_limit_reached|insufficient_credits?)(\s|$)/.test(
      identificador,
    ) ||
    mensagem.includes("insufficient quota") ||
    mensagem.includes("insufficient credits") ||
    mensagem.includes("billing hard limit") ||
    mensagem.includes("billing limit has been reached") ||
    mensagem.includes("exceeded your current quota") ||
    mensagem.includes("check your plan and billing details") ||
    mensagem.includes("credit balance is too low");

  if (faltaDeCredito) {
    return { categoria: "quota", status, code, type, technicalMessage };
  }

  if (
    identificador.includes("context_length_exceeded") ||
    identificador.includes("max_tokens") ||
    mensagem.includes("maximum context length") ||
    mensagem.includes("context length")
  ) {
    return { categoria: "context_length", status, code, type, technicalMessage };
  }

  if (
    status === 429 ||
    identificador.includes("rate_limit") ||
    mensagem.includes("rate limit") ||
    mensagem.includes("too many requests")
  ) {
    return { categoria: "rate_limit", status, code, type, technicalMessage };
  }

  if (
    status === undefined ||
    status === 408 ||
    identificador.includes("timeout") ||
    identificador.includes("connection") ||
    mensagem.includes("network") ||
    mensagem.includes("fetch failed") ||
    mensagem.includes("timed out")
  ) {
    return { categoria: "network", status, code, type, technicalMessage };
  }

  return { categoria: "internal", status, code, type, technicalMessage };
}

export function erroOpenAIEhFaltaDeCredito(error: unknown): boolean {
  return classificarErroOpenAI(error).categoria === "quota";
}

