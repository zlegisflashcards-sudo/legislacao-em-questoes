import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterLegiscastAdminLaws, normalizeLegiscastPdfPage } from "@/lib/legiscast-audios-admin-form";

const client = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");
const server = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");

const laws = [
  { id: 1, slug: "l6513ma", titulo: "Estatuto da Polícia Militar" },
  { id: 2, slug: "l14751", titulo: "Lei Orgânica Nacional" },
];

describe("formulário Admin LegisCast", () => {
  it("filtra as leis carregadas por título e slug", () => {
    expect(filterLegiscastAdminLaws(laws, "polícia")).toEqual([laws[0]]);
    expect(filterLegiscastAdminLaws(laws, "L14751")).toEqual([laws[1]]);
    expect(filterLegiscastAdminLaws(laws, "")).toEqual(laws);
  });

  it("implementa seleção pesquisável e acessível por teclado", () => {
    for (const expected of ['role="combobox"', 'role="listbox"', 'event.key === "Enter"', 'event.key === "Escape"', 'event.key === "ArrowDown"', 'aria-label="Limpar lei selecionada"']) expect(client).toContain(expected);
    expect(client).toContain("filterLegiscastAdminLaws(laws, query)");
  });

  it("filtra estruturas pela lei e carrega a página existente", () => {
    expect(client).toContain("structureOptions(structures, Number(uploadLawId))");
    expect(client).toContain("selectedStructure?.pdf_page");
    expect(client).toContain("setUploadStructureId(\"\")");
  });

  it("normaliza página vazia e aceita somente inteiro positivo", () => {
    expect(normalizeLegiscastPdfPage("")).toBeNull();
    expect(normalizeLegiscastPdfPage(" 7 ")).toBe(7);
    for (const invalid of ["0", "-1", "1.5", "texto"]) expect(() => normalizeLegiscastPdfPage(invalid)).toThrow("número inteiro maior ou igual a 1");
  });

  it("salva pdf_page na estrutura oficial antes de processar o áudio", () => {
    expect(client).toContain('operation: "update-structure-pdf-page"');
    expect(client.indexOf('operation: "update-structure-pdf-page"')).toBeLessThan(client.indexOf('operation: "authorize-original"'));
    expect(server).toContain('.from("law_structure").update({ pdf_page: pdfPage');
    expect(client).not.toContain("legiscast_audios.pdf_page");
  });

  it("mantém título opcional e layout responsivo sem overflow horizontal", () => {
    expect(client).toContain("Opcional. Se ficar vazio, será usado o nome da estrutura vinculada.");
    expect(client).not.toContain('name="titulo" required');
    expect(client).toContain("grid-cols-1 gap-4 lg:grid-cols-2");
    expect(client).toContain("min-w-0");
  });
});
