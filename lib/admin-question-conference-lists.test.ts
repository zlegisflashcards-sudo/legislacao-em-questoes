import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewConferenceListUuids } from "./admin-question-conference-lists";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

describe("listas personalizadas do conferidor", () => {
  it("lê TXT/CSV, preserva a ordem e separa repetidos e inválidos", () => {
    expect(
      previewConferenceListUuids(
        `\uFEFF${second}, ${first}\n${second}\nnao-uuid`,
      ),
    ).toEqual({
      total_received: 4,
      valid_unique: [second, first],
      duplicate_ids: [second],
      invalid_ids: ["nao-uuid"],
    });
  });

  it("aceita texto vazio sem inventar UUIDs", () => {
    expect(previewConferenceListUuids(" \n ")).toEqual({
      total_received: 0,
      valid_unique: [],
      duplicate_ids: [],
      invalid_ids: [],
    });
  });

  it("mantém itens e progresso isolados pela lista e pela lei no servidor", () => {
    const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
    const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20261013120000_create_admin_question_conference_lists.sql",
      "utf8",
    );
    expect(server).toContain("listAdminQuestionConferenceLists");
    expect(server).toContain('eq("lei_id", current.id)');
    expect(server).toContain("setAdminQuestionConferenceListProgress");
    expect(server).toContain("removeAdminQuestionConferenceListItem");
    expect(server).toContain("questionsByIds(current.id");
    expect(route).toContain('mode") === "conference-list"');
    expect(route).toContain('action === "criar_lista_conferencia"');
    expect(route).toContain('action === "marcar_lista_conferencia"');
    expect(migration).toContain("primary key (list_id, question_id)");
    expect(migration).toContain("foreign key (list_id, question_id)");
  });

  it("reaproveita o mesmo conferidor com filtros e progresso por lista", () => {
    const client = readFileSync(
      "components/admin/admin-question-conference.tsx",
      "utf8",
    );
    const page = readFileSync(
      "components/admin/admin-law-questions.tsx",
      "utf8",
    );
    expect(client).toContain(
      'mode: customListId ? "conference-list" : "conference"',
    );
    expect(client).toContain("Marcar como conferida");
    expect(client).toMatch(
      /direction === 1 &&\s+customList &&\s+current &&\s+!reviewedIds\.has\(current\.id\)/,
    );
    expect(client).toContain("Remover da lista");
    expect(client).toContain("Pendentes");
    expect(page).toContain("Listas personalizadas");
    expect(page).toContain("AdminQuestionConferenceLists");
  });
});
