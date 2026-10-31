import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterLegiscastAdminLaws } from "@/lib/legiscast-audios-admin-form";

const client = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");
const lawSearchSelect = readFileSync("components/law-search-select.tsx", "utf8");
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
    for (const expected of ['role="combobox"', 'role="listbox"', 'aria-expanded={open}', 'aria-label="Limpar lei selecionada"']) expect(lawSearchSelect).toContain(expected);
    expect(client).toContain("<LawSearchSelect");
  });

  it("filtra estruturas pela lei sem exigir página de PDF", () => {
    expect(client).toContain("structureOptions(structures, Number(uploadLawId))");
    expect(client).toContain("setUploadStructureId(\"\")");
    expect(client).not.toContain('name="pdf_page"');
    expect(client).not.toContain("Página no PDF");
    expect(client).not.toContain('operation: "update-structure-pdf-page"');
    expect(client).not.toContain("legiscast_audios.pdf_page");
    expect(server).toContain('.from("law_structure").update({ pdf_page: pdfPage');
  });

  it("mantém título opcional e layout responsivo sem overflow horizontal", () => {
    expect(client).toContain("Opcional. Usa o nome do trecho se ficar vazio.");
    expect(client).not.toContain('name="titulo" required');
    expect(client).toContain("grid gap-4 rounded-xl");
    expect(client).toContain("min-w-0");
  });
});
