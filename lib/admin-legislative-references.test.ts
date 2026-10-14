import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCandidatesFromQuestions, referencesNotYetStored } from "./legislative-reference-candidates";

describe("base legislativa persistente", () => {
  it("identifica uma referência por slug + ordem sem carregar legislação da questão", () => {
    const candidates = referenceCandidatesFromQuestions([
      { id: "a", slug: "CF", ordem: "0005.0.02.0.01.0", assunto: "Art. 5º, § 2º, I, Constituição Federal" },
      { id: "b", slug: "cf", ordem: "0005.0.02.0.01.0", assunto: "Outro recorte da mesma referência" },
    ]);
    expect(candidates).toEqual([{ sourceQuestionId: "a", slug: "cf", ordem: "0005.0.02.0.01.0", identification: "Art. 5º, § 2º, I, Constituição Federal" }]);
  });

  it("não seleciona referências já persistidas para nova preparação", () => {
    const candidates = referenceCandidatesFromQuestions([
      { id: "a", slug: "cf", ordem: "0001.0.00.0.00.0", assunto: "Art. 1º, CF" },
      { id: "b", slug: "cf", ordem: "0002.0.00.0.00.0", assunto: "Art. 2º, CF" },
    ]);
    expect(referencesNotYetStored(candidates, [{ slug: "CF", ordem: "0001.0.00.0.00.0" }])).toEqual([candidates[1]]);
  });

  it("mantém a aba Artigos independente das consultas agregadas de questões", () => {
    const service = readFileSync("lib/admin-legislative-references.ts", "utf8");
    const page = readFileSync("app/admin/artigos/page.tsx", "utf8");
    const migration = readFileSync("supabase/migrations/20261014110000_create_legislative_references.sql", "utf8");
    expect(page).toContain("listLegislativeReferences");
    expect(page).not.toContain("listArticleContexts(");
    expect(page).not.toContain("searchArticleContexts(");
    expect(migration).toContain("unique (lei_id, ordem)");
    expect(migration).toContain("legislacao text");
    expect(migration).toContain("legislative_references_validate_law_slug");
    expect(service).toContain("ignoreDuplicates: true");
    expect(service).toContain("range(offset, offset + PAGE_SIZE)");
  });
});
