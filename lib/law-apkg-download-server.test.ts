import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/law-apkg-download-server.ts", "utf8");
const route = readFileSync("app/api/aluno/estudar/lei/[slug]/apkg/route.ts", "utf8");

describe("download APKG pelo aluno", () => {
  it("autoriza a lei antes de reutilizar o exportador de conteúdo", () => {
    expect(server).toContain("await authorizeLawStudy(request, slug)");
    expect(server.indexOf("await authorizeLawStudy(request, slug)")).toBeLessThan(server.indexOf("await exportLawContentApkg(slug)"));
    expect(server).toContain('new LawStudyApiError(403, "Você não possui acesso a esta lei.")');
    expect(server).toContain('"Content-Disposition"');
  });

  it("usa rota de aluno em Node, sem rota administrativa", () => {
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("downloadAuthorizedLawApkg");
    expect(route).not.toContain("admin/questoes/exportar-apkg");
  });
});
