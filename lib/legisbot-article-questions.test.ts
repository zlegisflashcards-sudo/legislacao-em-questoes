import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const questions = readFileSync("components/legisbot-article-questions.tsx", "utf8");
const tabs = readFileSync("components/legisbot-study-tabs.tsx", "utf8");
const overlay = readFileSync("components/legisbot-overlay.tsx", "utf8");
const page = readFileSync("app/legisbot/legisbot-page-client.tsx", "utf8");

describe("questões no contexto do LegisBot", () => {
  it("usa uma aba interna em vez de navegar para o Legis Questões", () => {
    expect(tabs).toContain('key: "questions"');
    expect(tabs).toContain('label: "Questões"');
    expect(tabs).toContain("aria-label={tab.label}");
    expect(tabs).toContain('className="legisbot-tab-label"');
    expect(tabs).not.toContain("legisbot-article-questions-link");
    expect(overlay).toContain("showArticleQuestions={Boolean(question.ordem)}");
    expect(overlay).not.toContain("/questoes/");
    expect(page).toContain("<LegisBotArticleQuestions");
  });

  it("consulta somente as questões do slug, ordem e recorte autorizados", () => {
    expect(questions).toContain('new URLSearchParams({ ordem })');
    expect(questions).toContain('query.set("recorte_id", recorteId)');
    expect(questions).toContain('/api/questoes/${encodeURIComponent(slug.toLowerCase())}/estudar?${query}');
    expect(questions).toContain("Authorization: `Bearer ${token}`");
  });

  it("mantém pergunta, resposta, justificativa e navegação no painel", () => {
    expect(questions).toContain("sanitizeLegisQuestoesHtml");
    expect(questions).toContain(">Certo</button>");
    expect(questions).toContain(">Errado</button>");
    expect(questions).toContain("question.justificativa");
    expect(questions).toContain("← Anterior");
    expect(questions).toContain("Próxima →");
    expect(questions).toContain("Pratique sem sair do Trecho de estudo");
  });
});
