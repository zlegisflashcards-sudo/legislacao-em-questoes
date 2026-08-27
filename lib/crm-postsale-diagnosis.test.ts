import { describe, expect, it } from "vitest";
import { getE3Diagnosis, getE3PreviewDecision } from "@/lib/crm-postsale-diagnosis";

describe("diagnóstico da Etapa 3 do pós-venda", () => {
  it("classifica compra sem notificação como nunca enviado", () => {
    expect(getE3Diagnosis({ email: "aluno@example.com", hasAuth: false, notificationStatus: null })).toBe("never_sent");
  });

  it("prioriza falha conhecida", () => {
    expect(getE3Diagnosis({ email: "invalido", hasAuth: true, notificationStatus: "falhou" })).toBe("send_failed");
  });

  it("identifica Auth existente quando não há envio concluído", () => {
    expect(getE3Diagnosis({ email: "aluno@example.com", hasAuth: true, notificationStatus: null })).toBe("auth_existing");
  });

  it("identifica e-mail vazio ou inválido", () => {
    expect(getE3Diagnosis({ email: "", hasAuth: false, notificationStatus: null })).toBe("invalid_email");
    expect(getE3Diagnosis({ email: "aluno@invalido", hasAuth: false, notificationStatus: null })).toBe("invalid_email");
  });

  it("mantém reserva sem resultado como inconclusiva", () => {
    expect(getE3Diagnosis({ email: "aluno@example.com", hasAuth: false, notificationStatus: "reservado" })).toBe("inconclusive");
  });

  it("revalida elegibilidade no servidor antes de um futuro envio", () => {
    expect(getE3PreviewDecision({ exists: true, hasStudent: true, accessActive: true, currentStage: 3, email: "aluno@example.com" })).toBe("eligible");
    expect(getE3PreviewDecision({ exists: true, hasStudent: true, accessActive: false, currentStage: 3, email: "aluno@example.com" })).toBe("access_inactive");
    expect(getE3PreviewDecision({ exists: true, hasStudent: true, accessActive: true, currentStage: 4, email: "aluno@example.com" })).toBe("e3_completed");
    expect(getE3PreviewDecision({ exists: false, hasStudent: false, accessActive: false, currentStage: 0, email: null })).toBe("inconsistent");
  });
});
