import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("app/legisbot/[slug]/continuous-reading-client.tsx", "utf8");
const styles = readFileSync("app/legisbot/[slug]/continuous-reading.module.css", "utf8");

describe("leitura contínua pública", () => {
  it("remove diagnósticos técnicos e mostra somente a orientação ao aluno", () => {
    expect(client).toContain("Interaja com a legislação");
    expect(client).toContain("grifar, adicionar comentários ou solicitar uma explicação ao LegisBot");
    expect(client).not.toContain("% das questões vinculadas");
    expect(client).not.toContain("Completude não verificada");
    expect(client).not.toContain("Legislação em construção");
  });

  it("mostra somente a estrutura no sumário e acompanha a seção ativa", () => {
    expect(client).not.toContain('key: `reference:${reference.id}`');
    expect(client).not.toContain("reference.identificacao, reference");
    expect(client).toContain("for (const node of reference.hierarchy)");
    expect(client).toContain("aria-current");
    expect(client).toContain("IntersectionObserver");
    expect(client).toContain("setMobileTocOpen(false)");
  });

  it("mantém sumário recolhível, sticky no celular e margem segura para âncoras", () => {
    expect(client).toContain("desktopTocOpen");
    expect(client).toContain("mobileTocOpen");
    expect(styles).toContain("position: sticky");
    expect(styles).toContain("scroll-margin-top");
    expect(styles).toContain("env(safe-area-inset-bottom)");
  });

  it("não redireciona silenciosamente quando a âncora não existe", () => {
    expect(client).toContain("setMissingTarget(true)");
    expect(client).toContain("Este dispositivo não está disponível nesta versão da legislação");
  });
});
