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
    const authorized = read("app/legisbot/[slug]/continuous-reading-authorized-client.tsx");
    const legacy = read("app/legisbot/[slug]/[ordem]/page.tsx");
    expect(authorized).toContain("Acesso indisponível");
    expect(legacy).toContain("!continuousModel.structureReadiness.ready");
    expect(legacy).toContain("Falha ao verificar a preparação da leitura contínua");
  });

  it("não apresenta a prévia como pronta quando o diagnóstico estrutural ainda bloqueia a leitura", () => {
    const preview = read("app/admin/artigos/legisbot-preview/page.tsx");
    expect(preview).toContain("const structuresReady");
    expect(preview).toContain('releaseDashboard.integrity.reports.every((report) => report.status === "ready")');
    expect(preview).toContain("a leitura continua bloqueada por pendências atuais");
    expect(preview).toContain("query.confirmacao_liberada");
  });
});
