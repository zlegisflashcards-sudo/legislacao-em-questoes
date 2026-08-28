import { describe, expect, it } from "vitest";
import { formatCoachActivityAt } from "./coach-activity";

describe("atividade temporal do Coach", () => {
  it("formata a resposta em dia e hora no fuso informado", () => {
    expect(formatCoachActivityAt("2026-08-28T17:37:00.000Z", "America/Sao_Paulo")).toBe("28/08/2026 • 14:37");
  });

  it("não inventa uma data para registros legados inválidos", () => {
    expect(formatCoachActivityAt(null, "America/Sao_Paulo")).toBe("Data indisponível");
    expect(formatCoachActivityAt("invalida", "America/Sao_Paulo")).toBe("Data indisponível");
  });
});
