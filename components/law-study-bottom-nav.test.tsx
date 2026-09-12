import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/law-study-bottom-nav.tsx", "utf8");
const questionPage = readFileSync("app/estudar/lei/[slug]/page.tsx", "utf8");
const ankiPage = readFileSync("app/estudar/lei/[slug]/anki/page.tsx", "utf8");
const legiscastPage = readFileSync("app/estudar/lei/[slug]/legiscast/page.tsx", "utf8");

describe("navegação responsiva dos modos da lei", () => {
  it("monta as três rotas e preserva recorte_id somente quando presente", () => {
    expect(source).toContain('suffix: ""');
    expect(source).toContain('suffix: "/anki"');
    expect(source).toContain('suffix: "/legiscast"');
    expect(source).toContain("?recorte_id=${encodeURIComponent(recorteId)}");
  });

  it("mantém a barra inferior no mobile e mostra uma pill lateral no desktop", () => {
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).toContain("lg:hidden");
    expect(source).toContain("hidden w-44 -translate-y-1/2 flex-col");
    expect(source).toContain("right-5 top-1/2");
    expect(source).toContain("lg:flex");
    expect(source).toContain("env(safe-area-inset-bottom)");
  });

  it("é reutilizada nos três modos", () => {
    expect(questionPage).toContain('activeMode="questoes"');
    expect(ankiPage).toContain('activeMode="anki"');
    expect(legiscastPage).toContain('activeMode="legiscast"');
  });
});
