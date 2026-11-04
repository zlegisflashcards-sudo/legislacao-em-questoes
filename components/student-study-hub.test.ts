import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/student-study-hub.tsx", "utf8");

describe("central Meus estudos", () => {
  it("mantém Todas as leis adquiridas e Meus Atalhos como abas acessíveis", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={tab === "library"}');
    expect(source).toContain('aria-selected={tab === "shortcuts"}');
    expect(source).toContain('>Todas as leis adquiridas</button>');
    expect(source).toContain('>Meus Atalhos</button>');
    expect(source).toContain('<StudentShortcutsClient embedded />');
    expect(source).not.toContain('StudentExamClient');
    expect(source).not.toContain('Edital personalizado');
  });

  it("mantém carregamento e erro da biblioteca isolados da aba de atalhos", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Sala de Records');
    expect(source).toContain('tab === "library"');
    expect(source).toContain('tab === "shortcuts"');
  });

});
