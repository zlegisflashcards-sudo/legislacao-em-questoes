import { describe, expect, it } from "vitest";
import { sanitizeLegisQuestoesHtml } from "./legis-questoes-html";

describe("HTML de questões importadas", () => {
  it("preserva estrutura e formatação pedagógica do Anki", () => {
    const display = sanitizeLegisQuestoesHtml('<div><p><strong>Art. 10</strong><br><mark>Consulta</mark> <span style="color: rgb(255, 0, 0); font-weight: 700">importante</span></p><hr><small><sub>1</sub><sup>2</sup><u>texto</u><s>antigo</s></small></div>');
    for (const fragment of ["<div>", "<p>", "<strong>", "<br />", "<mark>", "<span", "color:", "font-weight:", "<hr", "<small>", "<sub>", "<sup>", "<u>", "<s>"]) expect(display).toContain(fragment);
  });

  it("preserva listas e tabelas com os atributos necessários", () => {
    const display = sanitizeLegisQuestoesHtml('<ul><li>um</li></ul><ol start="3"><li value="3">três</li></ol><table><caption>Quadro</caption><colgroup><col width="50%"></colgroup><thead><tr><th scope="col" colspan="2">Título</th></tr></thead><tbody><tr><td rowspan="2">A</td><td>B</td></tr></tbody><tfoot><tr><td>C</td></tr></tfoot></table>');
    for (const fragment of ["<ul>", "<ol", "<li", "<table>", "<caption>", "<colgroup>", "<col", "<thead>", "<tbody>", "<tfoot>", "<th", 'scope="col"', 'colspan="2"', 'rowspan="2"']) expect(display).toContain(fragment);
  });

  it("preserva links e imagens somente com URLs seguras", () => {
    const display = sanitizeLegisQuestoesHtml('<a href="https://example.com" target="_blank">Fonte</a><img src="https://example.com/card.png" alt="card" width="300" height="200">');
    expect(display).toContain('href="https://example.com"');
    expect(display).toContain('rel="noopener noreferrer"');
    expect(display).toContain('src="https://example.com/card.png"');
    expect(display).toContain('alt="card"');
  });

  it("remove elementos, atributos e URLs perigosos e normaliza marcação legada", () => {
    const display = sanitizeLegisQuestoesHtml('<markstyle="background-color:#dceeff;">Seguro</markstyle><script>alert(1)</script><iframe src="https://evil.example"></iframe><a href="javascript:alert(1)" onclick="alert(2)">link</a><img src="javascript:alert(3)" onerror="alert(4)">');
    expect(display).toContain("<mark");
    expect(display).toContain("Seguro");
    expect(display).not.toMatch(/script|iframe|onclick|onerror|javascript:|alert/i);
    expect(display).not.toContain("<img");
  });
});
