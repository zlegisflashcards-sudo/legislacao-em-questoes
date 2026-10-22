import { describe, expect, it } from "vitest";
import { aggregateCatalogModuleAvailability } from "./catalog-module-availability";

const complete = new Set(["questoes", "anki", "legiscast", "materiais"] as const);
const withoutLegiscast = new Set(["questoes", "anki", "materiais"] as const);

describe("disponibilidade de módulos no catálogo", () => {
  it("permite que uma lei avulsa com recorte reflita os checks concluídos da lei", () => {
    expect(aggregateCatalogModuleAvailability([
      { recorteId: "recorte-cf", completed: withoutLegiscast },
    ], true)).toEqual({ questoes: true, anki: true, legiscast: false, materiais: true });
  });

  it("mantém a agregação conservadora em produtos com mais de uma lei", () => {
    expect(aggregateCatalogModuleAvailability([
      { recorteId: null, completed: complete },
      { recorteId: "recorte-outra-lei", completed: complete },
    ])).toEqual({ questoes: false, anki: false, legiscast: false, materiais: false });
  });

  it("não marca o módulo se qualquer lei inteira vinculada estiver pendente", () => {
    expect(aggregateCatalogModuleAvailability([
      { recorteId: null, completed: complete },
      { recorteId: null, completed: withoutLegiscast },
    ])).toEqual({ questoes: true, anki: true, legiscast: false, materiais: true });
  });
});
