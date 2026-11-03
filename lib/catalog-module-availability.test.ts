import { describe, expect, it } from "vitest";
import { aggregateCatalogModuleAvailability } from "./catalog-module-availability";

const complete = new Set(["questoes", "anki", "legiscast", "materiais"] as const);
const withoutLegiscast = new Set(["questoes", "anki", "materiais"] as const);

describe("disponibilidade de módulos no catálogo", () => {
  it("permite que um recorte reflita os checks concluídos da lei", () => {
    expect(aggregateCatalogModuleAvailability([
      { completed: withoutLegiscast },
    ])).toEqual({ questoes: true, anki: true, legiscast: false, materiais: true });
  });

  it("não torna todos os módulos pendentes apenas porque o produto usa recortes", () => {
    expect(aggregateCatalogModuleAvailability([
      { completed: complete },
      { completed: complete },
    ])).toEqual({ questoes: true, anki: true, legiscast: true, materiais: true });
  });

  it("não marca o módulo se qualquer lei inteira vinculada estiver pendente", () => {
    expect(aggregateCatalogModuleAvailability([
      { completed: complete },
      { completed: withoutLegiscast },
    ])).toEqual({ questoes: true, anki: true, legiscast: false, materiais: true });
  });
});
