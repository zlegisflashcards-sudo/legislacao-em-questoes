import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveAnkiSlug, parseAnkiTxt, structureIdForDeck, validateImportSlug } from "./anki-txt-import";

const text = '#separator:tab\n#html:true\n#deck column:1\nLei X::CAPÍTULO I\tP<br><markstyle=""x""><span style=""color:red"">A</span>\tCerto\tJ\tA\tL\t0010.0.00.14\tLei X\t49\tlx\tAlterada\nLei X::CAPÍTULO I\tQ\tErrado\tJ\tA\tL\t0011.0.00.00\tLei X\t49\tlx\t';
const headers = "#separator:tab\n#html:true\n#deck column:1\n";
const fields = (overrides: Record<number, string> = {}) => {
  const row = ["Lei X::CAPÍTULO I", "Pergunta", "Certo", "Justificativa", "Assunto", "Legislação", "0010.0.00.14", "Lei X", "49", "lx", "Alterada"];
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
  return row.map((value) => /\t|\n|\r|"/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join("\t");
};

describe("TXT Anki", () => {
  it("preserva HTML, tabs e as 11 colunas", () => {
    const parsed = parseAnkiTxt(text);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].pergunta).toContain("<br>");
    expect(parsed.rows[0].ordem).toBe("0010.0.00.14");
    expect(parsed.rows[1].resposta).toBe("Errado");
  });

  it("reconstrói newline LF e múltiplos newlines na justificativa citada", () => {
    const parsed = parseAnkiTxt(headers + fields({ 3: "Linha 1\nLinha 2\nLinha 3" }));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toHaveLength(0);
    expect(parsed.rows[0].justificativa).toBe("Linha 1\nLinha 2\nLinha 3");
  });

  it("reconstrói CRLF e newline dentro da legislação", () => {
    const parsed = parseAnkiTxt((headers + fields({ 5: "Art. 1º\nInciso I" })).replace(/\n/g, "\r\n"));
    expect(parsed.rows[0].legislacao).toBe("Art. 1º\nInciso I");
  });

  it("aceita BOM, aspas escapadas e HTML com atributos citados", () => {
    const parsed = parseAnkiTxt(`\uFEFF${headers}${fields({ 1: '<span style="background-color: rgb(204, 229, 255)">"teste"</span>' })}`);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].pergunta).toContain('"teste"');
    expect(parsed.rows[0].pergunta).toContain("background-color");
  });

  it("usa o slug selecionado somente quando o campo vem vazio", () => {
    const empty = parseAnkiTxt(headers + fields({ 9: "" })).rows;
    expect(empty).toHaveLength(1);
    expect(validateImportSlug(empty, "lx").valid).toBe(true);
    expect(effectiveAnkiSlug(empty[0].slug, "lx")).toBe("lx");
    const different = parseAnkiTxt(headers + fields({ 9: "outra" })).rows;
    expect(validateImportSlug(different, "lx")).toMatchObject({ valid: false, message: "O arquivo pertence à legislação outra, mas a legislação selecionada é lx." });
    expect(effectiveAnkiSlug("lx", "outra")).toBe("lx");
  });

  it("valida slug e caminho estrutural", () => {
    const rows = parseAnkiTxt(text).rows;
    expect(validateImportSlug(rows, "lx").valid).toBe(true);
    expect(validateImportSlug(rows, "outra").valid).toBe(false);
    expect(structureIdForDeck(rows[0].deck, [{ id: 1, parent_id: null, nome: "CAPÍTULO I" }])).toBe(1);
  });

  it("reconstrói o arquivo Anki real com fallback de slug quando disponível", () => {
    const realFile = "C:/Users/User/Downloads/Lei 11.390 - Regulamento de Segurança Contra Incêndios.txt";
    if (!existsSync(realFile)) return;
    const parsed = parseAnkiTxt(readFileSync(realFile, "utf8"));
    expect(parsed.rows).toHaveLength(111);
    expect(parsed.issues).toHaveLength(0);
    expect(validateImportSlug(parsed.rows, "l11390ma").valid).toBe(true);
    expect(parsed.rows.filter((row) => !row.slug)).toHaveLength(22);
    expect(parsed.rows.map((row) => effectiveAnkiSlug(row.slug, "l11390ma")).every((value) => value === "l11390ma")).toBe(true);
  });

  it("lê exportação do Anki com colunas iniciais de note type e deck", () => {
    const exported = [
      "#separator:tab",
      "#html:true",
      "#notetype column:1",
      "#deck column:2",
      "1 - certo ou errado 4.0\tLei teste::Título 01\tEnunciado <strong>válido</strong>\tCerto\tJustificativa\tArt. 1º\tArt. 1º, Lei teste\t0001.0.00.00\tLei teste\t3\ttst\tatual",
    ].join("\n");
    expect(parseAnkiTxt(exported)).toMatchObject({
      issues: [],
      rows: [{ deck: ["Lei teste", "Título 01"], pergunta: "Enunciado <strong>válido</strong>", resposta: "Certo", ordem: "0001.0.00.00", slug: "tst" }],
    });
  });

  it("interpreta o TXT de teste com note type na primeira coluna quando disponível", () => {
    const fixture = "C:/Users/User/Documents/Lei teste.txt";
    if (!existsSync(fixture)) return;
    const parsed = parseAnkiTxt(readFileSync(fixture, "utf8"));
    expect(parsed.rows).toHaveLength(5);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows.map((row) => row.resposta)).toEqual(["Certo", "Errado", "Certo", "Errado", "Certo"]);
  });
});
