import { describe, expect, it } from "vitest";
import { canConcludeLegislativeUpdate, UPDATE_STEPS } from "./article-legislative-update";
import { readFileSync } from "node:fs";

const questionEditor = readFileSync("components/admin/question-rich-editor.tsx", "utf8");
const articlePanel = readFileSync("components/admin/article-legislative-updates.tsx", "utf8");
const updatesRoute = readFileSync("app/api/admin/artigos/atualizacoes/route.ts", "utf8");

describe("atualização legislativa por artigo", () => {
  it("mantém as seis tarefas administrativas independentes", () => {
    expect(UPDATE_STEPS).toEqual(["legislacao", "questoes_artigo", "questoes_outros_artigos", "legisbot", "legiscast", "materiais_relacionados"]);
  });
  it("só permite concluir quando todas as tarefas terminarem", () => {
    expect(canConcludeLegislativeUpdate("em_revisao", UPDATE_STEPS.slice(0, -1))).toBe(false);
    expect(canConcludeLegislativeUpdate("em_revisao", UPDATE_STEPS)).toBe(true);
  });

  it("expõe apenas o checklist e não cria vínculos de apoio", () => {
    expect(articlePanel).toContain("Conferir a legislação esquematizada");
    expect(articlePanel).toContain("Verificar se o LegisCast precisa de atualização");
    expect(articlePanel).not.toContain("Dispositivos de apoio");
    expect(updatesRoute).not.toContain("questionSupportingDevicesOverview");
    expect(questionEditor).toContain("Vincular referência");
  });
});
