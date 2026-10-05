import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conferenceCopyText, conferenceQuestions, parseConferenceTable } from "./admin-question-conference";

const server = readFileSync("lib/admin-questoes-server.ts", "utf8");
const route = readFileSync("app/api/admin/questoes/route.ts", "utf8");
const client = readFileSync("components/admin/admin-question-conference.tsx", "utf8");
const questionsPage = readFileSync("components/admin/admin-law-questions.tsx", "utf8");

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

  it("permite a fila da lei completa somente quando não há estrutura", () => {
    expect(server).toContain('if (rootId === null)');
    expect(server).toContain('if (nodes.length) throw new AdminQuestoesError(422, "Selecione um bloco estrutural para esta lei.")');
    expect(server).toContain('block: { id: null, nome: "Lei completa", complete_law: true }');
    expect(client).toContain('if (structureId !== null) params.set("structure_id", String(structureId))');
    expect(client).toContain('structure_id: structureId');
  });

  it("cria em lote somente no bloco atual, com validação de duplicidade e UUIDs novos", () => {
    for (const expected of ["conferenceArticleContext", "previewConferenceQuestionBatch", "createConferenceQuestionBatch", "validateConferenceBatch", "sameImportIdentity", "insert(drafts.map", 'action: "criar_lote_conferencia"']) expect(`${server}\n${route}\n${client}`).toContain(expected);
  });

  it("reutiliza salvar, prévia e confirmação de exclusão sem atalhos em campos editáveis", () => {
    for (const expected of ["action: \"atualizar\"", "action: \"resumo_exclusao_questao\"", "action: \"excluir_questao\"", "Ctrl + Enter", "isEditingTarget", "Há alterações não salvas", "Conferir erradas", "keepOutsideFilter", "Duplicar", "Nova questão", "Adicionar por tabela", "conference-context", "pasteTable", "+ Adicionar linha"]) expect(client).toContain(expected);
  });

  it("mantém conferência manual isolada por lei e bloco", () => {
    expect(server).toContain("getAdminQuestionStructureReviews");
    expect(server).toContain("setAdminQuestionStructureReview");
    expect(server).toContain('await validateStructure(current.id, structureId)');
    expect(route).toContain('mode") === "structure-reviews"');
    expect(route).toContain('marcar_revisao_estrutura');
    const reviewMigration = readFileSync("supabase/migrations/20261003100000_add_admin_question_structure_reviews.sql", "utf8");
    expect(reviewMigration).toContain("primary key (lei_id, structure_id)");
    expect(reviewMigration).toContain("foreign key (structure_id, lei_id)");
    expect(questionsPage).toContain("Marcar como conferido");
    expect(questionsPage).toContain("✓ Conferido");
    expect(questionsPage).toContain("stopPropagation");
  });

  it("persiste a marcação da lei sem estrutura separadamente", () => {
    expect(server).toContain('db().from("admin_question_law_reviews")');
    expect(server).toContain('A marcação da lei completa só está disponível quando não há estrutura cadastrada.');
    expect(questionsPage).toContain("law_reviewed");
    expect(questionsPage).toContain("Lei completa");
    const lawReviewMigration = readFileSync("supabase/migrations/20261005110000_add_admin_question_law_reviews.sql", "utf8");
    expect(lawReviewMigration).toContain("lei_id bigint primary key");
    expect(lawReviewMigration).toContain("enable row level security");
    expect(lawReviewMigration).toContain("service_role");
  });

  it("abre a Central do Artigo somente para contexto confiável, em nova guia", () => {
    expect(server).toContain("conferenceArticleLink");
    expect(server).toContain('if (!context.trusted) return { status: "conflict" as const, href: null }');
    expect(server).toContain('`/admin/artigos/${encodeURIComponent(current.slug.toLowerCase())}/${encodeURIComponent(context.ordem)}?aba=artigo');
    expect(route).toContain('mode") === "conference-article-link"');
    expect(client).toContain('target="_blank"');
    expect(client).toContain('rel="noopener noreferrer"');
    expect(client).toContain("contexto precisa ser conferido manualmente");
  });
});
