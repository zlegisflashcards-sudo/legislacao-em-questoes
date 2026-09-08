import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/law-study-bottom-nav.tsx", "utf8");
const questionPage = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");
const ankiPage = readFileSync("app/estudar/lei/[slug]/anki/page.tsx", "utf8");
const legiscastPage = readFileSync("app/estudar/lei/[slug]/legiscast/page.tsx", "utf8");

describe("navegação mobile dos modos da lei", () => {
  it("monta as três rotas e preserva recorte_id somente quando presente", () => {
    expect(source).toContain('suffix: ""');
    expect(source).toContain('suffix: "/anki"');
    expect(source).toContain('suffix: "/legiscast"');
    expect(source).toContain("?recorte_id=${encodeURIComponent(recorteId)}");
  });

  it("indica o modo ativo e aparece somente no mobile", () => {
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).toContain("lg:hidden");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("é reutilizada nos três modos", () => {
    expect(questionPage).toContain('activeMode="questoes"');
    expect(ankiPage).toContain('activeMode="anki"');
    expect(legiscastPage).toContain('activeMode="legiscast"');
  });
});
