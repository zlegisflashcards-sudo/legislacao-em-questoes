import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCandidatesFromQuestions, referencesNotYetStored } from "./legislative-reference-candidates";

describe("base legislativa persistente", () => {
  it("mantém a identificação por slug + ordem como metadado da importação", () => {
    const candidates = referenceCandidatesFromQuestions([
      { id: "a", slug: "CF", ordem: "0005.0.02.0.01.0", assunto: "Art. 5º, § 2º, I, Constituição Federal" },
      { id: "b", slug: "cf", ordem: "0005.0.02.0.01.0", assunto: "Outro recorte da mesma referência" },
    ]);
    expect(candidates).toEqual([{ sourceQuestionId: "a", slug: "cf", ordem: "0005.0.02.0.01.0", identification: "Art. 5º, § 2º, I, Constituição Federal" }]);
  });

  it("mantém o cálculo de referências já persistidas disponível para a importação", () => {
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
    expect(service).toContain("range(offset, offset + PAGE_SIZE)");
    expect(service).toContain('from("leis").select("id,nome_curto").in("id", lawIds)');
    expect(service).toContain("formatLegalReferenceFromOrder");
  });

  it("importa apenas textos existentes e não escolhe legislação divergente", () => {
    const service = readFileSync("lib/admin-legislative-references.ts", "utf8");
    const page = readFileSync("app/admin/artigos/page.tsx", "utf8");
    expect(service).toContain("importQuestionLegislationToReferences");
    expect(service).toContain("if (versions.size !== 1)");
    expect(service).toContain('.is("legislacao", null)');
    expect(service).toContain("Não é permitido criar bloco legislativo vazio");
    expect(page).toContain("Importar textos das questões");
    expect(service).toContain('from("legislative_reference_inventory").upsert');
    expect(service).toContain("resolveLegislativeReferenceShadow");
    expect(service).toContain("O inventário oficial não contém o texto deste dispositivo");
    expect(service).toContain("migration 20261019110000");
    expect(service).toContain("PGRST205");
    expect(service).toContain("falha no inventário");
    expect(service).toContain("hasDetails");
  });

  it("permite reiniciar a base da lei sem apagar questões ou LegisBots", () => {
    const source = readFileSync("lib/admin-legislative-references.ts", "utf8");
    expect(source).toContain("clearLegislativeReferences");
    expect(source).toContain('from("legislative_references").delete()');
    expect(source).toContain('preservados: ["questions", "legisbot_comentarios"]');
    expect(source).not.toContain('from("questions").delete()');
    expect(source).not.toContain('from("legisbot_comentarios").delete()');
  });
});
