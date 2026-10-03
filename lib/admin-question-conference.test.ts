import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conferenceCopyText, conferenceQuestions, parseConferenceTable } from "./admin-question-conference";

const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
const client = readFileSync("components/admin/admin-question-conference.tsx", "utf8");

describe("modo conferência administrativo", () => {
  const questions = [
    { id: "a", resposta: "Certo" as const, pergunta: "<p>Primeira</p>", legislacao: "Lei A" },
    { id: "b", resposta: "Errado" as const, pergunta: "<p>Segunda</p>", legislacao: "Lei B" },
  ];

  it("filtra pelo gabarito sem alterar a ordem", () => {
    expect(conferenceQuestions(questions, "all").map((question) => question.id)).toEqual(["a", "b"]);
    expect(conferenceQuestions(questions, "certo").map((question) => question.id)).toEqual(["a"]);
    expect(conferenceQuestions(questions, "errado").map((question) => question.id)).toEqual(["b"]);
  });

  it("gera texto de cópia usando apenas o título da lei, sem resposta, assunto ou HTML", () => {
    expect(conferenceCopyText({ ...questions[0], pergunta: "<p>Um<br>dois</p>", legislacao: "Texto legal que não deve ser copiado" }, "Código Penal")).toBe("Conforme o(a) Código Penal, julgue o item a seguir.\n\nUm\ndois\n\nCerto ou errado?");
  });

  it("lê uma tabela tabulada preservando o HTML das células", () => {
    expect(parseConferenceTable("Pergunta\tResposta\tJustificativa\tAssunto\tOrdem\tLegislação\n<p><strong>P</strong></p>\tCerto\t<p>J</p>\tArt. 1\t0001\t<p>L</p>")).toEqual([{ pergunta: "<p><strong>P</strong></p>", resposta: "Certo", justificativa: "<p>J</p>", assunto: "Art. 1", ordem: "0001", legislacao: "<p>L</p>" }]);
  });

  it("consulta todas as questões do bloco no servidor com isolamento por lei", () => {
    expect(server).toContain("export async function listAdminQuestionConference");
    expect(server).toContain('eq("lei_id", current.id).eq("ativo", true).in("structure_id", ids)');
    expect(server).toContain("descendantStructureIds(nodes, rootId)");
    expect(route).toContain('searchParams.get("mode") === "conference"');
  });

  it("cria em lote somente no bloco atual, com validação de duplicidade e UUIDs novos", () => {
    for (const expected of ["conferenceArticleContext", "previewConferenceQuestionBatch", "createConferenceQuestionBatch", "validateConferenceBatch", "sameImportIdentity", "insert(drafts.map", 'action: "criar_lote_conferencia"']) expect(`${server}\n${route}\n${client}`).toContain(expected);
  });

  it("reutiliza salvar, prévia e confirmação de exclusão sem atalhos em campos editáveis", () => {
    for (const expected of ["action: \"atualizar\"", "action: \"resumo_exclusao_questao\"", "action: \"excluir_questao\"", "Ctrl + Enter", "isEditingTarget", "Há alterações não salvas", "Conferir erradas deste bloco", "keepOutsideFilter", "Duplicar", "Nova questão", "Adicionar por tabela", "conference-context", "pasteTable", "+ Adicionar linha"]) expect(client).toContain(expected);
  });
});
