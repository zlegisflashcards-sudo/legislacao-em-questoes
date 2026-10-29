import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminQuestionAnkiTools, ApkgPreviewDetails } from "./admin-question-anki-tools";

const component = readFileSync("components/admin/admin-question-anki-tools.tsx", "utf8");

describe("APKG preview presentation", () => {
  it("renderiza o guia e separa aviso de atualização da nova excluída", () => {
    const guide = renderToStaticMarkup(createElement(AdminQuestionAnkiTools, { lawSlug: "lai", lawName: "LAI" }));
    expect(guide).toContain("Como importar e atualizar pelo APKG");
    expect(guide).toContain("Importar arquivo antigo pode sobrescrever");
    const html = renderToStaticMarkup(createElement(ApkgPreviewDetails, { preview: {
      total: 2, preview_token: "test", errors: [], warnings: [],
      summary: { novas: 0, atualizadas: 1, duplicadas: 0, conflitos: 0, avisos: 0, erros: 0 },
      structure: { items: [], existentes: 0, novas: 0, revisoes: 0 },
      apkg: { rootDecks: [], subdecks: [], notes: 2, cards: 2, recognizedModels: [], unrecognizedModels: [], media: [], samples: [] },
      items: [
        { line: 1, deck: "LAI", structure_id: null, existing_id: "uuid", status: "atualizada", motivo: null, expected: { pergunta: "Antes" }, proposed: { pergunta: "Depois" }, duplicate_ids: ["other"] },
        { line: 2, deck: "LAI", structure_id: null, status: "nova_duplicada", motivo: null, proposed: { pergunta: "Depois" }, duplicate_ids: ["uuid"] },
      ],
    } }));
    expect(html).toContain("Nova repetida — não será importada");
    expect(html).toContain("Atualizações por UUID continuam permitidas");
    expect(html).toContain("Antes:");
    expect(html).toContain("Depois:");
    expect(html).toContain("/admin/artigos?aba=conflitos");
  });
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
