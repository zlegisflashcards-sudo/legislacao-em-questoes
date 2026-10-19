import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261019100000_add_question_legislative_reference_links.sql", "utf8");
const server = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("vínculos editoriais de bloco legislativo", () => {
  it("mantém uma tabela própria, sem reaproveitar a origem de importação", () => {
    expect(migration).toContain("create table if not exists public.question_legislative_reference_links");
    expect(migration).toContain("reference_id uuid not null references public.legislative_references");
    expect(migration).toContain("question_legislative_reference_links_same_law");
  });

  it("não exige comentário do LegisBot para liberar texto legislativo preparado", () => {
    expect(server).toContain("listManualQuestionReferenceTargets");
    expect(server).not.toContain("resolveQuestionLegisBotLinks");
    expect(server).not.toContain("orphanQuestions");
  });
});
