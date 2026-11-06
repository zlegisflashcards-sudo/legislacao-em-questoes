import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAnkiTxt, validateImportSlug } from "./anki-txt-import";
import { groupImportSourceWarnings } from "./legisbot/import-source";
import { planQuestionDeckStructure } from "./questoes-structure";

const input = "C:/Users/User/Documents/Codex/2026-10-23/task-3/deliverables/rmtr-questoes-mapeamento-estrutura-corrigido.txt";
const partI = ["Princípios básicos", "Registros", "Separação de categorias", "Acomodações", "Vestuário próprio e roupas de cama", "Exercício e esporte", "Serviços de Saúde", "Instrumentos de restrição", "Revistas íntimas e inspeção em celas", "Livros", "Religião", "Retenção de pertences dos presos", "Remoção de presos", "Funcionários da unidade prisional", "Inspeções internas e externas"];
const existing = [
  { id: 1, parent_id: null, tipo: "parte" as const, nome: "I. Regras de aplicação geral" },
  ...partI.map((nome, index) => ({ id: index + 2, parent_id: 1, tipo: "capitulo" as const, nome })),
  { id: 17, parent_id: null, tipo: "parte" as const, nome: "II. Regras aplicáveis a categorias especiais" },
  { id: 18, parent_id: 17, tipo: "titulo" as const, nome: "A. Presos sentenciados" },
  { id: 19, parent_id: 18, tipo: "capitulo" as const, nome: "Princípios orientadores" },
  { id: 20, parent_id: 18, tipo: "capitulo" as const, nome: "Trabalho" },
  { id: 21, parent_id: 17, tipo: "titulo" as const, nome: "C. Presos sob custódia ou aguardando julgamento" },
];

describe("prévia RMTR de 33 notas", () => {
  it("reutiliza os 21 nós existentes e conserva somente os avisos editoriais", () => {
    const parsed = parseAnkiTxt(readFileSync(input, "utf8"));
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toHaveLength(33);
    expect(validateImportSlug(parsed.rows, "rmtr").valid).toBe(true);
    const plan = planQuestionDeckStructure(parsed.rows, existing);
    expect(plan.decks).toHaveLength(33);
    expect(plan.decks.every((deck) => deck.error === null)).toBe(true);
    expect(plan.nodes).toHaveLength(21);
    expect(plan.nodes.every((node) => node.existingId !== null && !node.requiresMapping && node.mappingError === null)).toBe(true);
    const warnings = groupImportSourceWarnings(parsed.rows.map((row) => ({ slug: row.slug, ordem: row.ordem, titulo: row.titulo, assunto: row.assunto, legislacao: row.legislacao })));
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "legislacao", ordem: "0004.0.01.0.00.0", versions: 2 }),
      expect.objectContaining({ kind: "estrutural", ordem: "0112.0.01.0.00.0", structuralStatus: "possible_conflict" }),
    ]));
    expect(warnings).toHaveLength(2);
  });
});
