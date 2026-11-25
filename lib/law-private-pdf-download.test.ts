import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authorize: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-study-server", () => ({
  authorizeLawStudy: auth.authorize,
  PUBLIC_SAMPLE_LAW_SLUG: "cf",
  LawStudyApiError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));
import { downloadAuthorizedLawMaterial } from "./law-material-download-server";

const request = new Request("https://example.test/api/aluno/estudar/lei/d11491/materiais/190/download");
const pdf = "%PDF-1.7\n%%EOF";
function testDatabase(material: unknown, body = pdf) {
  const materialQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: material }) };
  const privateQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { conteudo_base64: Buffer.from(body).toString("base64") } }) };
  const from = vi.fn((name: string) => name === "materiais_leis" ? materialQuery : privateQuery);
  auth.authorize.mockResolvedValue({ supabase: { from }, lawId: 205, title: "Convenção de Budapeste" });
  return { from, materialQuery, privateQuery };
}
const source = { titulo: "Budapeste", tipo: "pdf", provedor: "google_drive", acao: "abrir", url_externa: "https://drive.google.com/file/d/1k7VypXbvuO5v8IpJ_idix3Zu8ssN-IuQ/view" };

describe("PDF na página de estudo", () => {
  it("mostra o botão ao lado do Anki, sem depender de áudio", () => {
    const page = readFileSync("components/law-study-page-client.tsx", "utf8");
    const hero = page.slice(page.indexOf("law-study-hero"), page.indexOf('aria-label="Estudo ativo"'));
    expect(hero).toContain("Baixar arquivo para Anki");
    expect(hero).toContain("Baixar PDF");
    expect(hero).toContain("downloadStudyPdf(availablePdf.id)");
    expect(page).toContain('!publicStudy ? study.materials.find((item) => item.type === "pdf" && item.accessAvailable)');
  });
  it("bloqueia sem autorização antes de consultar o acervo", async () => {
    const db = testDatabase(source);
    auth.authorize.mockRejectedValueOnce(new Error("Acesso negado"));
    await expect(downloadAuthorizedLawMaterial(request, "d11491", "190")).rejects.toThrow("Acesso negado");
    expect(db.from).not.toHaveBeenCalled();
  });
  it("não busca a cópia se o material não pertencer à lei ou estiver indisponível", async () => {
    const db = testDatabase(null);
    await expect(downloadAuthorizedLawMaterial(request, "d11491", "190")).rejects.toThrow("Material temporariamente indisponível");
    expect(db.materialQuery.eq.mock.calls).toEqual([["id", 190], ["lei_id", 205], ["ativo", true]]);
    expect(db.privateQuery.select).not.toHaveBeenCalled();
  });
  it("entrega os bytes originais apenas pelo proxy privado", async () => {
    const db = testDatabase(source);
    const result = await downloadAuthorizedLawMaterial(request, "d11491", "190");
    expect(await result.text()).toBe(pdf);
    expect(result.headers.get("content-type")).toBe("application/pdf");
    expect(result.headers.get("cache-control")).toContain("private, no-store");
    expect(result.headers.get("content-disposition")).toContain("attachment");
    expect(db.privateQuery.eq).toHaveBeenCalledWith("material_id", 190);
  });
  it("rejeita um arquivo que não é PDF", async () => {
    testDatabase(source, "<html>login</html>");
    await expect(downloadAuthorizedLawMaterial(request, "d11491", "190")).rejects.toThrow("O PDF cadastrado está inválido");
  });
});
