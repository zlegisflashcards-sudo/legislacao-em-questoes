import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { descendantsForScope, normalizeScopeSelection } from "./law-question-scope-resolution";

const server = readFileSync("lib/law-anki-custom-deck-server.ts", "utf8");

describe("baralho Anki personalizado", () => {
  const nodes = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 1 }, { id: 4, parent_id: 2 }];
  it("inclui descendentes sem duplicar seleções sobrepostas", () => {
    expect(normalizeScopeSelection(nodes, [1, 2, 4])).toEqual([1]);
    expect(descendantsForScope(nodes, [1, 3])).toEqual([1, 2, 4, 3]);
  });
  it("mantém validação de escopo, filtros e identidade canônica no servidor", () => {
    expect(server).toContain("authorizeLawQuestionScope");
    expect(server).toContain("A seleção contém uma estrutura fora do conteúdo liberado");
    expect(server).toContain("reviewState(request, slug, input.filter)");
    expect(server).toContain("campanhas_leis_respostas");
    expect(server).toContain("buildLawApkg({ slug, titulo: result.context.title }");
  });
});
