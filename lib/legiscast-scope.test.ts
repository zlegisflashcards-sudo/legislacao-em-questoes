import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
  it("reutiliza a autorização oficial e preserva recorte_id na chamada", () => {
    expect(server).toContain("authorizeLawQuestionScope(request, slug, recorteId)");
    expect(server).toContain("context.structureIds");
    expect(player).toContain("recorte_id=${encodeURIComponent(recorteId)}");
    expect(page).toContain("recorteId={recorteId}");
  });
  it("mantém o PDF integral e identifica o recorte sem recriar viewer", () => {
    expect(page.match(/<LegiscastPdfViewer/g)).toHaveLength(2);
    expect(page).toContain("scopeName ?? \"Recorte selecionado\"");
    expect(page).toContain("onNavigateToPdfPage={setTargetPdfPage}");
  });
});
