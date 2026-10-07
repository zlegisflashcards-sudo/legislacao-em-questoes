import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { IMPORT_CONFIRMATION, normalizeMappingInput } from "./admin-article-mappings";
import { parseArticleMappingCsvObjects } from "./article-mapping-csv";

describe("mapeamento por contexto", () => {
  it("normaliza o metadado sem alterar a identidade slug + ordem", () => {
    expect(normalizeMappingInput({ slug: " CP ", ordem: "0001.0.00.0.00.0", incidencia: "alta", artigo_recente: true, origem_mapeamento: "manual", confianca: 0.8 })).toEqual({
      slug: "cp", ordem: "0001.0.00.0.00.0", incidencia: "alta", artigo_recente: true, origem_mapeamento: "manual", observacao_interna: null, confianca: 0.8,
    });
  });

  it("mantém valores editoriais inválidos fora do banco usando valores seguros", () => {
    const mapping = normalizeMappingInput({ slug: "cp", ordem: "0001.0.00.0.00.0", incidencia: "inventada", origem_mapeamento: "externa" });
    expect(mapping.incidencia).toBe("nao_mapeado");
    expect(mapping.origem_mapeamento).toBeNull();
  });

  it("rejeita confiança fora do intervalo permitido", () => {
    expect(() => normalizeMappingInput({ slug: "cp", ordem: "0001.0.00.0.00.0", confianca: 1.01 })).toThrow("entre 0 e 1");
  });

  it("usa uma frase explícita para confirmar a importação", () => {
    expect(IMPORT_CONFIRMATION).toBe("APLICAR MAPEAMENTO");
  });

  it("aceita contexto do LegisBot sem transformá-lo em questão", () => {
    const source = readFileSync("lib/admin-article-mappings.ts", "utf8");
    expect(source).toContain('db.from("legisbot_comentarios").select("id").eq("slug", row.slug.toUpperCase())');
    expect(source).toContain("Contexto não encontrado nas questões nem no LegisBot");
    expect(source).toContain("if (!groups.has(key)) groups.set");
    expect(source).toContain("quantidade_questoes: questions.length");
  });

  it("oferece a prévia colorida da lei no LegisCast", () => {
    const ui = readFileSync("components/admin/article-mapping-center.tsx", "utf8");
    expect(ui).toContain("Visualizar no LegisCast");
    expect(ui).toContain("/estudar/lei/${encodeURIComponent(law)}/legiscast");
  });

  it("filtra o mapeamento apenas pela incidência editorial", () => {
    const ui = readFileSync("components/admin/article-mapping-center.tsx", "utf8");
    expect(ui).toContain("filter === \"\" || filter === row.incidencia");
    expect(ui).toContain(">Muito alta<");
    expect(ui).not.toContain('value="questoes_reais"');
    expect(ui).not.toContain('value="conflito"');
  });

  it("relê o CSV exportado mesmo quando a legislação contém aspas e quebras de linha", () => {
    const rows = parseArticleMappingCsvObjects('slug,ordem,legislacao_consolidada,incidencia\n"l6513ma","0002.0.02.00","<div style=\\"font-weight: 400\\">Linha 1\nLinha 2</div>","alta"');
    expect(rows).toEqual([{ slug: "l6513ma", ordem: "0002.0.02.00", legislacao_consolidada: '<div style="font-weight: 400">Linha 1\nLinha 2</div>', incidencia: "alta" }]);
  });
});
