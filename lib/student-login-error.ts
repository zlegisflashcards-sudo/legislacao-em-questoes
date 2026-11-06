export type StudentLoginDiagnostic = {
  stage: "sign_in_with_password";
  code: string | null;
  status: number | null;
  observedAt: string;
};

export function studentLoginFailure(error: unknown, now = new Date()): { message: string; diagnostic: StudentLoginDiagnostic } {
  const value = error && typeof error === "object" ? error as { code?: unknown; status?: unknown; name?: unknown } : {};
  const code = typeof value.code === "string" && value.code ? value.code : null;
  const status = typeof value.status === "number" && Number.isInteger(value.status) ? value.status : null;
  const normalized = code?.toLowerCase() ?? "";
  const diagnostic = { stage: "sign_in_with_password" as const, code, status, observedAt: now.toISOString() };

  if (normalized === "email_not_confirmed") return { message: "Confirme o e-mail de acesso antes de entrar. Procure a mensagem de confirmação ou fale com o suporte.", diagnostic };
  if (status === 429 || normalized.includes("rate_limit") || normalized.includes("too_many")) return { message: "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente.", diagnostic };
  if (normalized === "fetch_error" || normalized === "network_error" || value.name === "TypeError") return { message: "Não foi possível conectar ao serviço de acesso. Verifique sua conexão e tente novamente.", diagnostic };
  if (status !== null && status >= 500) return { message: "O serviço de acesso está indisponível no momento. Tente novamente em alguns minutos.", diagnostic };
  return { message: "E-mail ou senha inválidos.", diagnostic };
}
