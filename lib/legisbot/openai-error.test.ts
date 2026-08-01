import { describe, expect, it, vi } from "vitest";
import { classificarErroOpenAI, erroOpenAIEhFaltaDeCredito } from "./openai-error";
import {
  JANELA_ALERTA_COTA_MS,
  processarAlertaCotaOpenAI,
  type DependenciasAlertaCota,
} from "./openai-quota-alert-core";

const contexto = {
  slug: "L11340",
  ordem: "0004.0.00.00",
  titulo: "Lei 11.340/2006",
  assunto: "Art. 4º",
  occurredAt: new Date("2026-07-31T12:00:00.000Z"),
};

const quota = classificarErroOpenAI({
  status: 429,
  code: "insufficient_quota",
  type: "insufficient_quota",
  message: "You exceeded your current quota, please check your plan and billing details.",
});

describe("classificação dos erros da OpenAI", () => {
  it("identifica insufficient_quota", () => {
    expect(quota.categoria).toBe("quota");
    expect(erroOpenAIEhFaltaDeCredito(quota)).toBe(true);
  });

  it("identifica limite de faturamento", () => {
    expect(
      classificarErroOpenAI({
        status: 429,
        code: "billing_hard_limit_reached",
        type: "invalid_request_error",
        message: "Billing hard limit has been reached.",
      }).categoria,
    ).toBe("quota");
  });

  it("não confunde rate limit comum com falta de crédito", () => {
    const rateLimit = {
      status: 429,
      code: "rate_limit_exceeded",
      type: "requests",
      message: "Rate limit reached for requests per minute.",
    };

    expect(classificarErroOpenAI(rateLimit).categoria).toBe("rate_limit");
    expect(erroOpenAIEhFaltaDeCredito(rateLimit)).toBe(false);
  });
});

describe("alerta administrativo de cota", () => {
  it("suprime repetições durante 30 minutos", async () => {
    let ultimoEnvio = 0;
    let agora = 1_000;
    const enviar = vi.fn(async () => undefined);
    const dependencias: DependenciasAlertaCota = {
      reservar: async (janelaMs) => {
        if (ultimoEnvio && agora - ultimoEnvio < janelaMs) return false;
        ultimoEnvio = agora;
        return true;
      },
      enviar,
      log: { info: vi.fn(), error: vi.fn() },
    };

    expect(await processarAlertaCotaOpenAI(contexto, quota, dependencias)).toBe("sent");
    agora += JANELA_ALERTA_COTA_MS - 1;
    expect(await processarAlertaCotaOpenAI(contexto, quota, dependencias)).toBe("suppressed");
    agora += 1;
    expect(await processarAlertaCotaOpenAI(contexto, quota, dependencias)).toBe("sent");
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("não propaga falha no envio do e-mail", async () => {
    const log = { info: vi.fn(), error: vi.fn() };
    const resultado = await processarAlertaCotaOpenAI(contexto, quota, {
      reservar: async () => true,
      enviar: async () => {
        throw new Error("Resend indisponível");
      },
      log,
    });

    expect(resultado).toBe("failed");
    expect(log.error).toHaveBeenCalledOnce();
  });
});
