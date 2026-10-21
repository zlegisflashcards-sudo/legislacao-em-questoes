import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("superfícies de preparação da Lei Interativa", () => {
  it("mantém o CTA apenas na página completa", () => {
    const notice = read("app/legisbot/[slug]/preparation-notice.tsx");
    expect(notice).toContain('href="/minhas-leis"');
    expect(notice).toContain("!embedded ? <Link");
    expect(notice).toContain("onClick={onClose}");
  });

  it("substitui o conteúdo do modal apenas quando a Central está em preparação", () => {
    const overlay = read("components/legisbot-overlay.tsx");
    expect(overlay).toContain('availability.status === "preparing"');
    expect(overlay).toContain("<PreparationNotice");
    expect(overlay).toContain("embedded onClose={onClose}");
    expect(overlay).toContain(": <LegisBotPageClient");
    expect(overlay).toContain('".legisbot-overlay-close, .legisbot-overlay-back"');
  });

  it("mantém erro técnico fora do cartão editorial e cobre a rota antiga", () => {
    const page = read("app/legisbot/[slug]/page.tsx");
    const legacy = read("app/legisbot/[slug]/[ordem]/page.tsx");
    expect(page).toContain("Leitura temporariamente indisponível");
    expect(legacy).toContain("continuousModel && !continuousModel.integrity.readingAvailable");
    expect(legacy).toContain("Falha ao verificar a preparação da leitura contínua");
  });
});
