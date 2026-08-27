import { isValidStudentAccessEmail } from "@/lib/student-access-email";

export type E3Diagnosis = "never_sent" | "send_failed" | "auth_existing" | "invalid_email" | "inconclusive";

type E3DiagnosisInput = {
  email: unknown;
  hasAuth: boolean;
  notificationStatus: unknown;
};

// A falha tem precedência para não esconder uma tentativa existente; depois vem
// segurança do endereço, conta existente, ausência de tentativa e inconclusivo.
export function getE3Diagnosis(input: E3DiagnosisInput): E3Diagnosis {
  if (input.notificationStatus === "falhou") return "send_failed";
  if (!isValidStudentAccessEmail(input.email)) return "invalid_email";
  if (input.hasAuth) return "auth_existing";
  if (!input.notificationStatus) return "never_sent";
  return "inconclusive";
}

export const E3_DIAGNOSIS_LABEL: Record<E3Diagnosis, string> = {
  never_sent: "Nunca enviado",
  send_failed: "Falha no envio",
  auth_existing: "Auth existente",
  invalid_email: "E-mail inválido",
  inconclusive: "Inconclusivo",
};

export function safeE3FailureMessage() {
  return "O envio não foi concluído. Consulte o log administrativo para detalhes.";
}

export type E3PreviewDecision = "eligible" | "invalid_email" | "access_inactive" | "e3_completed" | "inconsistent";

export function getE3PreviewDecision(input: { exists: boolean; hasStudent: boolean; accessActive: boolean; currentStage: number; email: unknown }): E3PreviewDecision {
  if (!input.exists || !input.hasStudent) return "inconsistent";
  if (!input.accessActive) return "access_inactive";
  if (input.currentStage !== 3) return "e3_completed";
  if (!isValidStudentAccessEmail(input.email)) return "invalid_email";
  return "eligible";
}
