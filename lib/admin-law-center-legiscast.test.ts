import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("LegisCast na Central da Lei", () => {
  it("usa a rota contextual como única interface de LegisCast", () => {
    const centralPath = "app/admin/leis/[slug]/legiscast/page.tsx";
    expect(existsSync(centralPath)).toBe(true);
    const central = read(centralPath);
    expect(central).toContain("<LegiscastAudiosAdmin lawContext=");
    expect(read("app/admin/legiscast-audios/page.tsx")).toContain('redirect("/admin/leis")');
    expect(central).toContain("getAdminLawBySlug");
  });

  it("mantém o seletor somente no modo geral e fixa a lei no modo contextual", () => {
    const client = read("components/admin/legiscast-audios-admin.tsx");
    expect(client).toContain("lawContext ?");
    expect(client).toContain('type="hidden" name="lei_id" value={uploadLawId}');
    expect(client).toContain(": <LawSearchSelect");
    expect(client).toContain("lawContext ? String(lawContext.id)");
    expect(client).toContain("useState<number | null>(lawContext?.id ?? null)");
  });

  it("filtra no servidor áudios, processamentos e estruturas pela lei da URL", () => {
    const route = read("app/api/admin/legiscast-audios/route.ts");
    const server = read("lib/admin-legiscast-audios-server.ts");
    expect(route).toContain('searchParams.get("law_slug")');
    expect(route).toContain("listAdminLegiscastAudios(lawSlug)");
    expect(server).toContain("listAdminLegiscastAudios(lawSlug?: string | null)");
    expect(server).toContain('lawsRequest.eq("slug", normalizedSlug)');
    expect(server).toContain('audiosRequest = audiosRequest.eq("lei_id", lawId)');
    expect(server).toContain('jobsRequest = jobsRequest.eq("lei_id", lawId)');
    expect(server).toContain('structuresRequest = structuresRequest.eq("lei_id", lawId)');
  });

  it("preserva o fluxo completo de upload, processamento e acervo", () => {
    const client = read("components/admin/legiscast-audios-admin.tsx");
    for (const operation of ["authorize-original", "confirm-original", "retry", "update", "preview", "delete", "update-structure-pdf-page"]) expect(client).toContain(`"${operation}"`);
    for (const status of ["pendente", "processando", "concluido", "erro"]) expect(client).toContain(`"${status}"`);
    expect(client).toContain("LEGISCAST_ORIGINAL_MAX_BYTES");
    expect(client).toContain("isAcceptedLegiscastOriginal");
  });

  it("permite áudio sem estrutura e orienta a criação sem depender de Questões ou Anki", () => {
    const client = read("components/admin/legiscast-audios-admin.tsx");
    const server = read("lib/admin-legiscast-audios-server.ts");
    expect(client).toContain('"Sem estrutura"');
    expect(client).toContain("criar a estrutura da lei");
    expect(server).not.toContain('.from("questions")');
    expect(server).not.toContain("anki");
  });

  it("mantém pdf_page em law_structure e limita a alteração à lei informada", () => {
    const client = read("components/admin/legiscast-audios-admin.tsx");
    const server = read("lib/admin-legiscast-audios-server.ts");
    expect(client).toContain("lawId: uploadLawId");
    expect(server).toContain('.from("law_structure").update({ pdf_page: pdfPage');
    expect(server).toContain('request = request.eq("lei_id", lawId)');
    expect(client).not.toContain("legiscast_audios.pdf_page");
  });

  it("atualiza navegação e atalho da visão geral para a rota contextual", () => {
    expect(read("app/admin/leis/[slug]/layout.tsx")).toContain('href={`${base}/legiscast`}');
    expect(read("app/admin/leis/[slug]/page.tsx")).toContain('href={`${base}/legiscast`}');
  });
});
