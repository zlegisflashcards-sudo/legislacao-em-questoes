import { describe, expect, it } from "vitest";
import { doctrineAccessDecision, hasDoctrineEntitlement } from "./doctrine-study-policy";
import { hasStudyEntitlement } from "./study-access-policy";

describe("acesso de doutrina", () => {
  it("nega visitante anônimo", () => {
    expect(doctrineAccessDecision({ authenticated: false, student: false, published: false, passwordChangeRequired: false, activeRelease: false }))
      .toEqual({ allowed: false, status: 401 });
  });

  it("nega aluno sem vínculo de compra/liberação", () => {
    expect(doctrineAccessDecision({ authenticated: true, student: true, published: true, passwordChangeRequired: false, activeRelease: false }))
      .toEqual({ allowed: false, status: 404 });
  });

  it("permite somente aluno com vínculo ativo", () => {
    expect(doctrineAccessDecision({ authenticated: true, student: true, published: true, passwordChangeRequired: false, activeRelease: true }))
      .toEqual({ allowed: true, status: 200 });
  });

  it("não transforma acesso gratuito de lei em acesso de doutrina", () => {
    expect(hasStudyEntitlement(false, true)).toBe(true);
    expect(hasDoctrineEntitlement(false)).toBe(false);
    expect(hasDoctrineEntitlement(true)).toBe(true);
  });
});
