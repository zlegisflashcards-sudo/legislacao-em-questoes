import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");

describe("APKG preview presentation", () => {
  it("separa contagens de questões novas, atualizações, idênticas e bloqueadas", () => {
    expect(component).toContain('<strong>Novas:</strong> {preview.summary.novas}');
    expect(component).toContain('<strong>Atualizações:</strong> {preview.summary.atualizadas}');
    expect(component).toContain('<strong>Sem alterações:</strong> {preview.summary.duplicadas}');
    expect(component).toContain('<strong>Bloqueadas:</strong> {blocked.length}');
    expect(component).toContain("Atualizações por UUID");
    expect(component).toContain("Antes:");
    expect(component).toContain("Depois:");
  });

  it("não oferece confirmação quando a prévia não tem ações", () => {
    expect(component).toContain("preview.summary.novas + preview.summary.atualizadas === 0");
    expect(component).toContain("Nenhuma alteração a aplicar. Esta análise é idempotente");
  });

  it("mostra o conflito 409 e exige nova análise", () => {
    expect(component).toContain("if (preview && !result && error)");
    expect(component).toContain("const stalePreview =");
    expect(component).toContain("{stalePreview ?");
    expect(component).toContain('role="alert"');
    expect(component).toContain("A questão foi alterada após a prévia. Analise o APKG novamente antes de importar.");
  });

  it("troca a tela por resultado antes da ação de confirmar", () => {
    const result = component.indexOf("if (result) return");
    const confirmation = component.indexOf("Confirmar atualização de");
    expect(result).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(result);
  });
});
