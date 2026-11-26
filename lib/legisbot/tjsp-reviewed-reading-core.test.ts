import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildReviewedReading } from "./tjsp-reviewed-reading-core";
import { tjspL10261Manifest } from "./tjsp-l10261-reading-manifest";
import { tjspL9099Manifest } from "./tjsp-l9099-reading-manifest";

const law = { id: 27, slug: "l9099", titulo: "Lei 9.099", nome_curto: null, codigo: null };
const legislation = "<p>Art. 88. Texto conferido.</p>";
const manifest = [["a", "0088.0.00.0.00.0", 977, createHash("sha256").update(legislation).digest("hex")]] as const;
const row = { id: "a", ordem: "0088.0.00.0.00.0", structure_id: 977, legislacao: legislation, preparado_em: "2026-11-26", situacao: null, identificacao: "Art. 88" };
const nodes = [
  { id: 971, nome: "Capítulo 03", ordem: 3, tipo: "capitulo", parent_id: null },
  { id: 977, nome: "Seção 06", ordem: 6, tipo: "secao", parent_id: 971 },
  { id: 975, nome: "Seção 04", ordem: 4, tipo: "secao", parent_id: 971 },
];
const sample = { law, manifest, rows: [row], nodes, selected: new Set([971]), blocked: new Set<number>() };

describe("Lei 9.099 no recorte TJSP", () => {
  it("assegura todos os 44 blocos previstos, sem 84–87 nem 90 em diante", () => {
    const order = (n: number) => `${String(n).padStart(4,"0")}.0.00.0.00.0`;
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => order(from + i));
    expect(tjspL9099Manifest.map(([, code]) => code)).toEqual([
      ...range(3, 12), "0012.a.00.0.00.0", ...range(13, 19), ...range(60, 83), ...range(88, 89),
    ]);
    expect(new Set(tjspL9099Manifest.map(([id]) => id)).size).toBe(44);
  });
  it("inclui a redação conferida do art. 318 na Lei 10.261 e não inclui revogados ou texto de fora do edital", () => {
    const blocks = tjspL10261Manifest.map(([, order, structureId]) => ({ article: Number(order.split(".")[0]), structureId }));
    expect(blocks).toHaveLength(191);
    expect(new Set(tjspL10261Manifest.map(([id]) => id)).size).toBe(191);
    expect(blocks).toContainEqual({ article: 318, structureId: 6642 });
    expect(blocks.filter(({ article }) => [322, 323].includes(article))).toEqual([
      { article: 322, structureId: 7107 }, { article: 323, structureId: 7107 },
    ]);
    expect(blocks.some(({ article }) => [56, 63].includes(article))).toBe(false);
    expect(blocks.every(({ article }) => article >= 1 && article <= 86 || article >= 171 && article <= 175 || article >= 239 && article <= 323)).toBe(true);
  });
  it("mostra só artigos conferidos e seus caminhos, não toda a seção ou capítulo", () => {
    const model = buildReviewedReading(sample);
    expect(model?.references.map((ref) => ref.ordem)).toEqual(["0088.0.00.0.00.0"]);
    expect(model?.publicAccess.accessibleStructureIds).toEqual([971, 977]);
    expect(model?.reviewedBlockTexts?.get("a")).toContain("Texto conferido");
  });
  it("fecha se aparecer um bloco extra ou faltar um bloco, inclusive na mesma seção", () => {
    expect(buildReviewedReading({ ...sample, rows: [] })).toBeNull();
    expect(buildReviewedReading({ ...sample, rows: [row, { ...row, id: "extra", ordem: "0090.0.00.0.00.0" }] })).toBeNull();
  });
  it.each([
    { legislacao: "<p>Texto novo sem revisão</p>" }, { structure_id: 975 },
    { ordem: "0090.0.00.0.00.0" }, { preparado_em: null }, { situacao: "arquivada" }, { situacao: "revogada" },
  ])("fecha após mudança editorial %o", (change) => {
    expect(buildReviewedReading({ ...sample, rows: [{ ...row, ...change }] })).toBeNull();
  });
  it("fecha quando estrutura ou vínculo oficial saiu, ou quando um ancestral está bloqueado", () => {
    expect(buildReviewedReading({ ...sample, selected: new Set([975]) })).toBeNull();
    expect(buildReviewedReading({ ...sample, nodes: nodes.slice(1) })).toBeNull();
    expect(buildReviewedReading({ ...sample, blocked: new Set([971]) })).toBeNull();
  });
});
