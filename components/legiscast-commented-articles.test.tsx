import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("components/legiscast-commented-articles.tsx", "utf8");
const overlay = readFileSync("components/legisbot-overlay.tsx", "utf8");
const studyClient = readFileSync("components/legis-questoes-study-client.tsx", "utf8");
const repository = readFileSync("lib/legisbot/legislacao-comentada-publica.ts", "utf8");
const page = readFileSync("app/estudar/lei/[slug]/legiscast/page.tsx", "utf8");

describe("artigos comentados no LegisCast", () => {
  it("deriva a legislação de questions e associa somente comentários concluídos", () => {
    expect(repository).toContain('from("questions")');
    expect(repository).toContain('eq("ativo", true)');
    expect(repository).toContain('.eq("slug", slugNormalizado)');
    expect(repository).toContain('.eq("status", "concluido")');
    expect(repository).toContain('.not("comentario", "is", null)');
    expect(repository).toContain('comment.status === "concluido"');
    expect(repository).toContain("legislations.size !== 1 || subjects.size !== 1");
    expect(page).toContain("buscarLegislacaoComentadaPublicaPorSlug(slug)");
  });

  it("não renderiza a seção vazia, limita inicialmente e pesquisa a lista completa", () => {
    expect(component).toContain("if (!comments.length) return null");
    expect(component).toContain("INITIAL_VISIBLE_ARTICLES = 18");
    expect(component).toContain("comments.slice(0, INITIAL_VISIBLE_ARTICLES)");
    expect(component).toContain("comments.filter");
    expect(component).toContain("Nenhum artigo confiável encontrado.");
  });

  it("abre o modal oficial no artigo correto sem navegação full-page", () => {
    expect(component).toContain("columns-1");
    expect(component).toContain("lg:columns-3");
    expect(component).toContain("setSelectedComment(comment)");
    expect(component).toContain("<LegisBotOverlay");
    expect(component).toContain("slug={selectedComment.slug}");
    expect(component).toContain("question={selectedComment}");
    expect(component).toContain("onClose={() => setSelectedComment(null)}");
    expect(component).not.toContain("next/link");
    expect(component).not.toContain("window.location");
    expect(component).toContain("Ver mais");
    expect(component).toContain("Ver menos");
  });

  it("reutiliza o overlay do Legis Questões e preserva a página montada", () => {
    expect(studyClient).toContain('import { LegisBotOverlay } from "@/components/legisbot-overlay"');
    expect(overlay).toContain('role="dialog"');
    expect(overlay).toContain("embedded");
    expect(overlay).toContain("onClose={onClose}");
    expect(overlay).toContain('event.key === "Escape"');
    expect(component).toContain("data-recorte-id={recorteId ?? undefined}");
  });
});
