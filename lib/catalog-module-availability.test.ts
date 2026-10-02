import { describe, expect, it } from "vitest";
import { aggregateCatalogModuleAvailability, unavailableCatalogModules } from "@/lib/catalog-module-availability";

const complete = new Set(["questoes", "anki", "legiscast", "materiais"] as const);

describe("disponibilidade dos módulos comerciais", () => {
  it("usa os checks da lei em produto individual", () => {
    expect(aggregateCatalogModuleAvailability([{ recorteId: null, completed: new Set(["questoes", "anki"] as const) }])).toEqual({ questoes: true, anki: true, legiscast: false, materiais: false });
  });

  it("exige conclusão em todas as leis de um combo", () => {
    expect(aggregateCatalogModuleAvailability([{ recorteId: null, completed: complete }, { recorteId: null, completed: new Set(["questoes", "anki", "materiais"] as const) }])).toEqual({ questoes: true, anki: true, legiscast: false, materiais: true });
  });

  it("mantém recortes e produtos sem vínculo em produção", () => {
    expect(aggregateCatalogModuleAvailability([{ recorteId: "15", completed: complete }])).toEqual(unavailableCatalogModules());
    expect(aggregateCatalogModuleAvailability([])).toEqual(unavailableCatalogModules());
  });
});
