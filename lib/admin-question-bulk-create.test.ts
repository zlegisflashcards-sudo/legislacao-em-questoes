import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBulkQuestionPaste, parseBulkQuestionPasteDrafts } from "./admin-question-bulk-create";

const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
const client = readFileSync("components/admin/admin-law-questions.tsx", "utf8");

const table = [
  "Pergunta\tResposta\tJustificativa\tReferência Legal\tLegislação\tOrdem",
  "A regra é aplicável.\tcerto\tPorque está no texto.\tArt. 1º, Decreto nº 19.841/1945\tArt. 1º Texto legal\t0001.0.00.0.00.0",
].join("\n");

describe("colagem de questões em lote", () => {
  it("lê os seis campos exigidos de uma tabela colada e normaliza o gabarito", () => {
    expect(parseBulkQuestionPaste(table)).toEqual([{
      pergunta: "A regra é aplicável.", resposta: "Certo", justificativa: "Porque está no texto.", assunto: "Art. 1º, Decreto nº 19.841/1945", legislacao: "Art. 1º Texto legal", ordem: "0001.0.00.0.00.0",
    }]);
  });

  it("aceita cabeçalhos em outra ordem e CSV delimitado por ponto e vírgula", () => {
    const csv = [
      "Ordem;Legislação;Referência Legal;Justificativa;Resposta;Pergunta",
      "0002.0.00.0.00.0;Art. 2º;Art. 2º, Decreto;Fundamento;Errado;A regra não é aplicável.",
    ].join("\n");
    expect(parseBulkQuestionPaste(csv)[0]).toMatchObject({ pergunta: "A regra não é aplicável.", resposta: "Errado", assunto: "Art. 2º, Decreto", ordem: "0002.0.00.0.00.0" });
  });

  it("aceita tabela Markdown e ignora sua linha de separadores", () => {
    const markdown = [
      "| Pergunta | Resposta | Justificativa | Referência Legal | Legislação | Ordem |",
      "|---|---|---|---|---|---|",
      "| A regra é aplicável. | certo | Porque está no texto. | Art. 1º, Decreto | Artigo 1º | 0001.0.00.0.00.0 |",
    ].join("\n");
    expect(parseBulkQuestionPaste(markdown)).toEqual([{
      pergunta: "A regra é aplicável.", resposta: "Certo", justificativa: "Porque está no texto.", assunto: "Art. 1º, Decreto", legislacao: "Artigo 1º", ordem: "0001.0.00.0.00.0",
    }]);
  });

  it("rejeita tabela incompleta e informa a linha com conteúdo inválido", () => {
    expect(() => parseBulkQuestionPaste("Pergunta\tResposta\tOrdem\nUma questão\tCerto\t1")).toThrow("Use as colunas");
    expect(() => parseBulkQuestionPasteDrafts(table.replace("certo", "talvez"), { structure_id: 7, titulo: "Decreto", total_artigos: 19 })).toThrow("Linha 2: Resposta deve ser Certo ou Errado.");
  });

  it("exige prévia e mantém a criação toda na mesma lei e no mesmo bloco", () => {
    expect(server).toContain("previewBulkQuestionCreation");
    expect(server).toContain("createBulkAdminQuestions");
    expect(server).toContain("Selecione o bloco estrutural que receberá as questões.");
    expect(server).toContain("já existe uma questão ativa com o mesmo enunciado nesta lei");
    expect(server).toContain("insert(prepared.drafts.map");
    expect(route).toContain('body.action === "previsualizar_criacao_lote"');
    expect(route).toContain('body.action === "criar_lote"');
    expect(client).toContain("Criar questões em lote");
    expect(client).toContain("Prévia da criação");
    expect(client).toContain("Formato da tabela");
    expect(client).toContain("Referência Legal");
    expect(client).toContain("tabela Markdown");
  });
});
