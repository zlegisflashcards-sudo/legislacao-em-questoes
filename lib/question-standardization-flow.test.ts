import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldNavigateToStandardizedOrder, standardizationContextOrder } from "./question-standardization-flow";

describe("fluxo de contexto da padronização", () => {
  it("mantém a ordem inicial até a alteração de ordem ser aplicada", () => {
    expect(standardizationContextOrder("0078.00.00.02.00.00", "0078.00.00.03.00.00", ["assunto"])).toBe("0078.00.00.02.00.00");
  });
  it("usa a nova ordem para legislação após Ordem + outro campo", () => {
    expect(standardizationContextOrder("0078.00.00.02.00.00", "0078.00.00.03.00.00", ["assunto", "ordem"])).toBe("0078.00.00.03.00.00");
    expect(shouldNavigateToStandardizedOrder("0078.00.00.02.00.00", "0078.00.00.03.00.00", ["assunto", "ordem", "legislacao"])).toBe(true);
  });
  it("não navega quando ordem não foi alterada", () => expect(shouldNavigateToStandardizedOrder("0078.00.00.02.00.00", "0078.00.00.02.00.00", ["assunto", "legislacao"])).toBe(false));
  it("leva conflitos resolvidos à lista filtrada, e não a uma rota de detalhe que pode deixar de existir", () => {
    const conflictDetail = readFileSync("components/admin/article-source-conflict-detail.tsx", "utf8");
    expect(conflictDetail).toContain('`/admin/artigos?aba=conflitos&lei=${encodeURIComponent(conflict.slug)}&ordem=${encodeURIComponent(nextOrder)}`');
    expect(conflictDetail).not.toContain('`/admin/artigos/conflitos/${encodeURIComponent(conflict.slug.toLowerCase())}/${encodeURIComponent(nextOrder)}`');
  });
  it("padroniza o contexto inteiro sem seleção individual e preserva o filtro da lei", () => {
    const articleQuestions = readFileSync("components/admin/article-questions.tsx", "utf8");
    const trigger = readFileSync("components/admin/article-context-standardization-trigger.tsx", "utf8");
    const panel = readFileSync("components/admin/question-standardization-panel.tsx", "utf8");
    const service = readFileSync("lib/admin-article-context-standardization.ts", "utf8");
    expect(trigger).toContain("Padronizar contexto inteiro");
    expect(articleQuestions).not.toContain('type="checkbox"');
    expect(panel).toContain("aplicar_padronizacao_contexto");
    expect(panel).toContain("contextMode");
    expect(service).toContain('from("legisbot_comentarios")');
    expect(service).toContain('from("legisbot_comentarios_comunidade")');
    expect(service).toContain('from("legisbot_destaques_usuario")');
    expect(trigger).toContain("&lei=${encodeURIComponent(slug)}");
  });
});
