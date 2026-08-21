import { describe, expect, it } from "vitest";
import { ankiApkgFileName, stableAnkiGuid, stableAnkiId } from "./anki-apkg-identity";

describe("identidade da exportação APKG", () => {
  it("mantém GUID da note estável por lei e questão", () => {
    expect(stableAnkiGuid("l9455", "questao-1")).toBe(stableAnkiGuid("l9455", "questao-1"));
    expect(stableAnkiGuid("l9455", "questao-1")).not.toBe(stableAnkiGuid("l9455", "questao-2"));
  });

  it("mantém IDs e nome do arquivo determinísticos", () => {
    expect(stableAnkiId("deck:l9455:Lei 9455")).toBe(stableAnkiId("deck:l9455:Lei 9455"));
    expect(ankiApkgFileName("Lei nº 9.455 - Crimes de Tortura")).toBe("Lei-9455-Crimes-de-Tortura-Legis-Flashcards.apkg");
  });
});
