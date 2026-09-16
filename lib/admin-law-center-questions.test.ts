import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_QUESTION_SEARCH_LIMIT, ADMIN_QUESTION_SEARCH_MAX_LIMIT, adminQuestionSearchTerms, parseAdminQuestionSearchFilter, plainQuestionText } from "./admin-question-search";

const read = (path: string) => readFileSync(path, "utf8");
const server = read("lib/admin-questoes-server.ts");
const route = read("app/api/admin/questoes/route.ts");
const central = read("components/admin/admin-law-questions.tsx");
const editor = read("components/admin/admin-question-editor.tsx");

describe("Questões na Central da Lei", () => {
  it("cria a rota contextual sem seletor de lei", () => {
    const page = "app/admin/leis/[slug]/questoes/page.tsx";
    expect(existsSync(page)).toBe(true);
    expect(read(page)).toContain("<AdminLawQuestions law=");
    expect(central).not.toContain("LawSearchSelect");
  });

  it("pesquisa no enunciado e na justificativa no servidor", () => {
    const search = server.slice(server.indexOf("export async function searchAdminQuestions"), server.indexOf("export async function getAdminQuestion"));
    expect(search).toContain('"pergunta", "justificativa"');
    expect(search).toContain(".ilike.%${term}%");
    expect(route).toContain('searchParams.get("mode") === "search"');
  });

  it("pesquisa campos textuais relevantes e respeita todos os termos", () => {
    for (const field of ["artigo", "assunto", "legislacao", "ordem", "titulo", "capitulo", "secao", "subsecao"]) expect(server).toContain(`"${field}"`);
    expect(adminQuestionSearchTerms("  afastamento, do lar  ")).toEqual(["afastamento", "do", "lar"]);
    expect(adminQuestionSearchTerms("um dois três quatro cinco seis sete")).toHaveLength(6);
    expect(adminQuestionSearchTerms("... / -")).toEqual([]);
  });

  it("isola pesquisa e leitura completa pela lei atual", () => {
    const search = server.slice(server.indexOf("export async function searchAdminQuestions"), server.indexOf("export async function createAdminQuestion"));
    expect(search).toContain('.eq("lei_id", current.id)');
    expect(search).toContain('.eq("id", qid(questionId)).eq("lei_id", current.id)');
    expect(search).toContain("Questão não encontrada para a lei selecionada.");
  });

  it("aplica os filtros Certo, Errado e Sem estrutura", () => {
    expect(parseAdminQuestionSearchFilter("certo")).toBe("certo");
    expect(parseAdminQuestionSearchFilter("errado")).toBe("errado");
    expect(parseAdminQuestionSearchFilter("unstructured")).toBe("unstructured");
    expect(server).toContain('request.eq("resposta", "Certo")');
    expect(server).toContain('request.eq("resposta", "Errado")');
    expect(server).toContain('request.is("structure_id", null)');
  });

  it("usa debounce, limite e paginação server-side", () => {
    expect(ADMIN_QUESTION_SEARCH_LIMIT).toBe(30);
    expect(ADMIN_QUESTION_SEARCH_MAX_LIMIT).toBe(50);
    expect(central).toContain("window.setTimeout");
    expect(central).toContain("}, 350)");
    expect(server).toContain("request.range(offset, offset + limit - 1)");
    expect(central).toContain('limit: "30"');
  });

  it("não envia o HTML completo de todas as questões na pesquisa", () => {
    expect(server).toContain('select("id,structure_id,pergunta,resposta,artigo,assunto,ordem,ativo,updated_at", { count: "exact" })');
    expect(server).toContain("pergunta_trecho: plainQuestionText(question.pergunta)");
    expect(central).toContain('question_id: id');
    expect(plainQuestionText("<p>Afastamento&nbsp;do <strong>lar</strong></p>")).toBe("Afastamento do lar");
  });

  it("preserva pesquisa, filtro e página após salvar", () => {
    const save = central.slice(central.indexOf("async function save("), central.indexOf("return <section"));
    expect(save).toContain("setRefresh((value) => value + 1)");
    expect(save).not.toContain("setQuery(");
    expect(save).not.toContain("setFilter(");
    expect(save).not.toContain("setPage(");
  });

  it("protege edição de questão pertencente a outra lei", () => {
    const update = server.slice(server.indexOf("export async function updateAdminQuestion"), server.indexOf("export async function updateQuickAdminQuestion"));
    expect(update).toContain('.eq("id", questionId).eq("lei_id", current.id)');
    expect(update).toContain("Questão ativa não encontrada para a lei selecionada.");
  });

  it("cria questão diretamente na lei atual e valida sua estrutura", () => {
    const create = server.slice(server.indexOf("export async function createAdminQuestion"), server.indexOf("export async function updateAdminQuestion"));
    expect(create).toContain("const current = await law(String(body.law_slug))");
    expect(create).toContain("await validateStructure(current.id, d.structure_id)");
    expect(create).toContain("values(current, d)");
    expect(central).toContain("law_slug: law.slug");
  });

  it("reutiliza o editor completo no Admin antigo e na Central", () => {
    expect(read("components/admin/admin-questoes.tsx")).toContain("<AdminQuestionEditor");
    expect(central).toContain("<AdminQuestionEditor");
    for (const field of ["pergunta", "resposta", "justificativa", "assunto", "legislacao", "artigo", "ordem", "structure_id", "titulo", "total_artigos", "capitulo", "secao", "subsecao"]) expect(editor).toContain(field);
    expect(editor).toContain("<QuestionRichEditor");
  });

  it("mantém o Admin antigo, seu seletor e os fluxos Anki/Recortes", () => {
    const legacy = read("components/admin/admin-questoes.tsx");
    expect(legacy).toContain("<LawSearchSelect");
    expect(legacy).toContain("<LawScopesPanel");
    expect(legacy).toContain("<AdminQuestionAnkiTools");
    const anki = read("components/admin/admin-question-anki-tools.tsx");
    expect(anki).toContain("<AnkiImport");
    expect(anki).toContain("<ApkgImport");
    expect(anki).toContain("Exportar APKG");
  });

  it("trata lei vazia, termo sem resultado e grandes conjuntos", () => {
    expect(central).toContain("Nenhuma questão encontrada");
    expect(central).toContain("results.map");
    expect(central).toContain("Página {page} de {pages}");
    expect(server).toContain("count: \"exact\"");
  });

  it("atualiza navegação e visão geral para a rota contextual", () => {
    expect(read("app/admin/leis/[slug]/layout.tsx")).toContain('href={`${base}/questoes`}');
    expect(read("app/admin/leis/[slug]/page.tsx")).toContain('href={`${base}/questoes`}');
  });
});
