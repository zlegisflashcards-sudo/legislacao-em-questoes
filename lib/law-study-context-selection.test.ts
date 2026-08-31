import { describe, expect, it } from "vitest";
import { mustChooseLawStudyContext, selectLawStudyContext, shouldShowLawStudyContextSelector } from "./law-study-context-selection";

const full = { recorteId: null, nome: "Lei completa" };
const pmerj = { recorteId: "3512e6c7-df4b-486a-85e6-8d16f535c3ae", nome: "PMERJ" };
const another = { recorteId: "0d1edc4f-0000-4000-8000-000000000001", nome: "Outro recorte" };

describe("seleção explícita de contexto de estudo", () => {
  it("abre diretamente quando há apenas lei completa", () => {
    expect(selectLawStudyContext([full], null)).toEqual(full);
    expect(mustChooseLawStudyContext([full], null)).toBe(false);
  });

  it("abre diretamente no único recorte", () => {
    expect(selectLawStudyContext([pmerj], null)).toEqual(pmerj);
    expect(mustChooseLawStudyContext([pmerj], null)).toBe(false);
  });

  it("exige escolha para lei completa mais recorte", () => {
    expect(selectLawStudyContext([full, pmerj], null)).toBeNull();
    expect(mustChooseLawStudyContext([full, pmerj], null)).toBe(true);
  });

  it("exige escolha para dois ou três recortes", () => {
    expect(mustChooseLawStudyContext([pmerj, another], null)).toBe(true);
    expect(mustChooseLawStudyContext([full, pmerj, another], null)).toBe(true);
  });

  it("preserva a escolha explícita de recorte e de lei completa", () => {
    expect(selectLawStudyContext([full, pmerj], pmerj.recorteId)).toEqual(pmerj);
    expect(selectLawStudyContext([full, pmerj], null, true)).toEqual(full);
    expect(selectLawStudyContext([full, pmerj], "desconhecido")).toBeNull();
  });

  it("não exige nova escolha quando a URL já declara um dos contextos", () => {
    expect(mustChooseLawStudyContext([full, pmerj], pmerj.recorteId)).toBe(false);
    expect(mustChooseLawStudyContext([full, pmerj], null, true)).toBe(false);
    expect(mustChooseLawStudyContext([full, pmerj], null)).toBe(true);
  });

  it("mostra o seletor somente quando a URL base ainda precisa de escolha", () => {
    expect(shouldShowLawStudyContextSelector([full, pmerj], pmerj.recorteId)).toBe(false);
    expect(shouldShowLawStudyContextSelector([full, pmerj], null, true)).toBe(false);
    expect(shouldShowLawStudyContextSelector([full, pmerj], null)).toBe(true);
    expect(shouldShowLawStudyContextSelector([pmerj], null)).toBe(false);
  });
});
