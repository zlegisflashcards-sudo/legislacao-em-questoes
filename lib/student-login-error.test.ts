import { describe, expect, it } from "vitest";
import { studentLoginFailure } from "./student-login-error";

const at = new Date("2026-11-06T19:10:00.000Z");

describe("mensagens seguras de login do aluno", () => {
  it("mantém credenciais inválidas neutras e preserva o diagnóstico técnico", () => {
    const result = studentLoginFailure({ code: "invalid_credentials", status: 400 }, at);
    expect(result.message).toBe("E-mail ou senha inválidos.");
    expect(result.diagnostic).toEqual({ stage: "sign_in_with_password", code: "invalid_credentials", status: 400, observedAt: at.toISOString() });
  });

  it.each([
    [{ code: "email_not_confirmed", status: 400 }, "Confirme o e-mail de acesso antes de entrar. Procure a mensagem de confirmação ou fale com o suporte."],
    [{ code: "over_request_rate_limit", status: 429 }, "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente."],
    [{ code: "fetch_error" }, "Não foi possível conectar ao serviço de acesso. Verifique sua conexão e tente novamente."],
    [{ code: "unexpected_failure", status: 503 }, "O serviço de acesso está indisponível no momento. Tente novamente em alguns minutos."],
  ])("classifica com orientação segura: %o", (error, message) => {
    expect(studentLoginFailure(error, at).message).toBe(message);
  });
});
