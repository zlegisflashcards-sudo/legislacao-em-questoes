import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseLegisApkg } from "./anki-apkg-import";
import { downloadAuthorizedLawScopeApkg } from "./law-apkg-scope-download-server";
import { downloadCustomDeck } from "./law-anki-custom-deck-server";

const { authorize, resolve } = vi.hoisted(() => ({ authorize: vi.fn(), resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-question-scope-auth", () => ({ authorizeLawQuestionScope: authorize }));
vi.mock("@/lib/law-question-scopes", () => ({ resolveQuestionsForLawScope: resolve }));
vi.mock("@/lib/questions-main-server", () => ({
  mainStructure: async () => [{ id: 7, parent_id: null, nome: "Capítulo 03 - Dos Auxiliares da Justiça" }],
}));
vi.mock("@/lib/law-study-server", () => ({ LawStudyApiError: Error }));
vi.mock("@/lib/law-review-server", () => ({ reviewState: vi.fn() }));
vi.mock("@/lib/legisbot/continuous-reading-server", () => ({ getContinuousQuestionDestinations: async () => new Map() }));

const scopeId = "7cdac816-cdbc-487f-8a3a-ec215babe28f";
const item = { id: "13b4ae1e-8dad-4506-8618-743325103305", structure_id: 7, pergunta: "O rol de auxiliares é aberto.", resposta: "Certo", ordem: "0149.0.00.0.00.0", total_artigos: 1 };

describe("TotalArtigos no APKG do aluno", () => {
  it("busca o total junto com os dados oficiais da lei", () => {
    const source = readFileSync("lib/law-study-server.ts", "utf8");
    expect(source).toContain('houve_alteracao_legislativa,total_artigos").eq("slug", normalizedSlug)');
  });

  it.each([["cpc", 1072], ["cpp", 811], ["cp", 361], ["cf", 250], ["l9099", 97]] as const)(
    "inclui o total da lei %s, não a quantidade do recorte nem o valor da questão",
    async (slug, total) => {
      const request = new Request(`https://example.test/download?recorte_id=${scopeId}`);
      authorize.mockResolvedValue({ lawId: 140, title: "Lei de teste", law: { total_artigos: total }, recorte: { id: scopeId } });
      resolve.mockResolvedValue([item]);
      const response = await downloadAuthorizedLawScopeApkg(request, slug, scopeId);
      expect(authorize).toHaveBeenCalledWith(request, slug, scopeId);
      expect(resolve).toHaveBeenCalledWith(140, scopeId);
      const { rows } = await parseLegisApkg(Buffer.from(await response.arrayBuffer()));
      expect(rows.map((row) => [row.ordem, row.total_artigos])).toEqual([[item.ordem, String(total)]]);
    },
  );

  it("usa o mesmo total para a lei integral e para o baralho personalizado", async () => {
    const request = new Request("https://example.test/download");
    authorize.mockResolvedValue({ lawId: 140, title: "Código de Processo Civil", law: { total_artigos: 1072 }, recorte: null });
    resolve.mockResolvedValue([item]);
    const downloads = [
      await downloadAuthorizedLawScopeApkg(request, "cpc", null),
      await downloadCustomDeck(request, "cpc", { includedStructureIds: [7], excludedStructureIds: [], filter: "all" }),
    ];
    for (const response of downloads) {
      const { rows } = await parseLegisApkg(Buffer.from(await response.arrayBuffer()));
      expect(rows.map((row) => row.total_artigos)).toEqual(["1072"]);
    }
  });
});
