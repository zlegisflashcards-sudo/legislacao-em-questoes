import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync(new URL("./admin-questoes-server.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/questoes/route.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../components/admin/admin-law-questions.tsx", import.meta.url), "utf8");

describe("filtro administrativo por recorte", () => {
  it("restringe busca, contagens e operações em lote ao recorte validado", () => {
    expect(server).toContain("async function scopeStructureIds");
    expect(server).toContain("scopeId: body.recorte_id");
    expect(server).toContain("questionsInScope");
    expect(route).toContain('searchParams.get("recorte_id")');
  });

  it("envia o recorte selecionado para a API e reduz a árvore lateral", () => {
    expect(client).toContain('params.set("recorte_id", scopeId)');
    expect(client).toContain("visibleStructureIdsForScope");
    expect(client).toContain("<span>Recorte</span>");
    expect(client).toContain("recorte_id: scopeId");
  });
});
