import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { listAuthorizedLegiscastAudios } from "@/lib/legiscast-audios-server";

const { authorizeLawStudy, getSupabaseServerClient } = vi.hoisted(() => ({
  authorizeLawStudy: vi.fn(),
  getSupabaseServerClient: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-study-server", () => ({ authorizeLawStudy }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient }));
import { audiosForLegiscastScope, structureForLegiscastScope } from "@/lib/legiscast-scope";

const server = readFileSync("lib/legiscast-audios-server.ts", "utf8");
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");
const page = readFileSync("components/law-legiscast-page-client.tsx", "utf8");
const nodes = [{ id: 1, parent_id: null, nome: "Título I" }, { id: 2, parent_id: 1, nome: "Capítulo I" }, { id: 3, parent_id: 2, nome: "Seção I" }, { id: 4, parent_id: 1, nome: "Capítulo II" }];

describe("LegisCast integrado aos recortes", () => {
  it("mantém a lei completa inalterada", () => {
    expect(structureForLegiscastScope(nodes, null)).toEqual(nodes);
    const audios = [{ id: "a", structure_id: 3 }, { id: "b", structure_id: null }];
    expect(audiosForLegiscastScope(audios, null)).toEqual(audios);
  });
  it("filtra o recorte e mantém somente ancestrais necessários à hierarquia", () => {
    expect(structureForLegiscastScope(nodes, [3]).map((node) => node.id)).toEqual([1, 2, 3]);
    expect(structureForLegiscastScope(nodes, [3, 4]).map((node) => node.id)).toEqual([1, 2, 3, 4]);
  });
  it("carrega somente áudios estruturados pertencentes ao recorte", () => {
    const audios = [{ id: "a", structure_id: 3 }, { id: "b", structure_id: 4 }, { id: "c", structure_id: null }];
    expect(audiosForLegiscastScope(audios, [3])).toEqual([audios[0]]);
  });
  it("reutiliza a autorização oficial e mantém LegisCast no escopo da lei", () => {
    expect(server).toContain("authorizeLawStudy(request, slug)");
    expect(server).toMatch(/Recortes delimitam\s*\/\/ questões e Anki, mas não reduzem o catálogo audiovisual\./);
    expect(player).toContain("recorte_id=${encodeURIComponent(recorteId)}");
    expect(page).not.toContain("recorteId=");
    expect(player).toContain("recorteId = null");
  });
  it("não consulta nem assina faixas quando a autorização é negada", async () => {
    const denied = new Error("Lei não liberada");
    authorizeLawStudy.mockRejectedValueOnce(denied);
    const request = new Request("https://fixture.test/api/aluno/leis/lei/legiscast");

    await expect(listAuthorizedLegiscastAudios(request, "lei")).rejects.toBe(denied);
    expect(authorizeLawStudy).toHaveBeenCalledWith(request, "lei");
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("acrescenta o título autorizado sem alterar campos existentes do catálogo", async () => {
    authorizeLawStudy.mockResolvedValueOnce({ lawId: 1, title: "Lei de teste" });
    const query = (data: unknown[]) => ({
      select: () => ({ eq: () => ({ eq: async () => ({ data }) }) }),
    });
    const structure = [{ id: 2, parent_id: null, tipo: "capitulo", nome: "Capítulo I", ordem: 1, pdf_page: 4 }];
    const audio = { id: "faixa", structure_id: 2, titulo: "Faixa de teste", descricao: "", duracao_segundos: 30, ordem: 1, storage_path: "fixture.m4a" };
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "/fixture-url" } }));
    getSupabaseServerClient.mockReturnValueOnce({
      from: (table: string) => query(table === "legiscast_audios" ? [audio] : structure),
      storage: { from: () => ({ createSignedUrl }) },
    });

    const request = new Request("https://fixture.test/api/aluno/leis/lei/legiscast");
    const result = await listAuthorizedLegiscastAudios(request, "lei");
    expect(result).toEqual({
      lawTitle: "Lei de teste",
      structure,
      recorte: null,
      audios: [expect.objectContaining({ id: "faixa", structureId: 2, url: "/fixture-url" })],
    });
    expect(createSignedUrl).toHaveBeenCalledExactlyOnceWith("fixture.m4a", 3600);
  });
});
