import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBulkQuestionEdit, parseBulkQuestionTextReplacement, replaceCompleteQuestionText } from "./admin-question-bulk-edit";

const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
const client = readFileSync("components/admin/admin-law-questions.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260928120000_add_admin_bulk_question_editing.sql", "utf8");
const replacementMigration = readFileSync("supabase/migrations/20261022150000_add_admin_bulk_question_text_replacement.sql", "utf8");
const replacementHotfixMigration = readFileSync("supabase/migrations/20261022160000_fix_admin_bulk_question_text_replacement_nullif.sql", "utf8");

describe("edição em lote de questões", () => {
  it("aceita somente os campos do editor individual e conserva os tipos", () => {
    expect(parseBulkQuestionEdit({ scope: "all", field: "total_artigos", value: 12 })).toEqual({ scope: "all", field: "total_artigos", value: 12 });
    expect(parseBulkQuestionEdit({ scope: "selected", field: "structure_id", value: 42 })).toEqual({ scope: "selected", field: "structure_id", value: 42 });
    expect(parseBulkQuestionEdit({ scope: "selected", field: "justificativa", value: "" }).value).toBeNull();
    expect(parseBulkQuestionEdit({ scope: "results", field: "resposta", value: "Errado" }).value).toBe("Errado");
    expect(() => parseBulkQuestionEdit({ scope: "all", field: "id", value: "x" })).toThrow("Campo não permitido");
    expect(() => parseBulkQuestionEdit({ scope: "all", field: "ordem", value: "inválida!" })).toThrow("Ordem inválido");
  });

  it("aceita substituição literal apenas em campos textuais e exige o texto localizado", () => {
    expect(parseBulkQuestionTextReplacement({ scope: "selected", field: "assunto", find: "Lei 13.869/2019", replace: "Lei 13.869" })).toEqual({ scope: "selected", field: "assunto", find: "Lei 13.869/2019", replace: "Lei 13.869" });
    expect(parseBulkQuestionTextReplacement({ scope: "results", field: "legislacao", find: "antigo", replace: "" }).replace).toBe("");
    expect(() => parseBulkQuestionTextReplacement({ scope: "all", field: "ordem", find: "1", replace: "2" })).toThrow("Campo não permitido");
    expect(() => parseBulkQuestionTextReplacement({ scope: "all", field: "assunto", find: "", replace: "novo" })).toThrow("Informe o texto");
    expect(replaceCompleteQuestionText("Assunto: Lei 13.869; Lei 13.869/2019", "Lei 13.869", "Lei 13.869/2019")).toBe("Assunto: Lei 13.869/2019; Lei 13.869/2019");
    expect(replaceCompleteQuestionText("L13869", "L13869", "Lei 13.869/2019")).toBe("Lei 13.869/2019");
  });

  it("resolve seleção no servidor para selecionadas, filtros paginados e lei inteira", () => {
    const resolver = server.slice(server.indexOf("async function bulkQuestionEditIds"), server.indexOf("type BulkQuestionEditPreview"));
    expect(resolver).toContain('scope === "all"');
    expect(resolver).toContain('scope === "results"');
    expect(resolver).toContain("while (page <= pages)");
    expect(resolver).toContain("body.question_ids.map(qid)");
    expect(resolver).toContain('.eq("lei_id", current.id)');
  });

  it("exige uma prévia idêntica antes de aplicar e usa a RPC transacional", () => {
    expect(server).toContain('JSON.stringify(expected) !== JSON.stringify(resolved.preview.expected)');
    expect(server).toContain('rpc("admin_bulk_update_law_questions"');
    expect(route).toContain('body.action === "previsualizar_edicao_lote"');
    expect(route).toContain('body.action === "aplicar_edicao_lote"');
    expect(migration).toContain("pg_advisory_xact_lock(p_lei_id)");
    expect(migration).toContain("lock table public.questions");
    expect(migration).toContain("As questoes foram alteradas desde a previa");
    expect(migration).toContain("insert into public.auditoria_administrativa");
    expect(migration).toContain("revoke all on function public.admin_bulk_update_law_questions");
    expect(server).toContain('rpc("admin_bulk_replace_law_question_text"');
    expect(route).toContain('body.action === "previsualizar_substituicao_lote"');
    expect(route).toContain('body.action === "aplicar_substituicao_lote"');
    expect(replacementMigration).toContain("pg_advisory_xact_lock(p_lei_id)");
    expect(replacementMigration).toContain("lock table public.questions");
    expect(replacementMigration).toContain("As questoes foram alteradas desde a previa");
    expect(replacementMigration).toContain("substituir_texto_lote");
    expect(replacementMigration).toContain("revoke all on function public.admin_bulk_replace_law_question_text");
    expect(replacementHotfixMigration).toContain("pg_get_functiondef");
    expect(replacementHotfixMigration).toContain("pg_catalog.nullif(");
    expect(replacementHotfixMigration).toContain("nullif(");
  });

  it("mantém a interface responsiva com prévia, amostra e seleção explícita", () => {
    expect(client).toContain("Editar em lote");
    expect(client).toContain("Mover em lote");
    expect(client).toContain("Substituir texto");
    expect(client).toContain("Texto a localizar");
    expect(client).toContain("Ver prévia da substituição");
    expect(client).toContain("Operação aplicada com sucesso.");
    expect(client).toContain("Alteração concluída");
    expect(client).toContain("Ver prévia da movimentação");
    expect(client).toContain('type="checkbox"');
    expect(client).toContain("Selecionar todas desta página");
    expect(client).toContain("Desmarcar todas desta página");
    expect(client).toContain("right-3 top-3");
    expect(client).toContain("Resultado atual dos filtros");
    expect(client).toContain('Prévia da {movingStructure ? "movimentação" : replacingText ? "substituição" : "alteração"}');
    expect(client).toContain("QuestionRichEditor");
    expect(client).toContain("Exemplos de alteração");
  });
});
