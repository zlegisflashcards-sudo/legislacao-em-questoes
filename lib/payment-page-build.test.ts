import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encontrarLegislacaoPorSlug, getLegislacoes } from "./legislacoes";

const paymentPage = readFileSync("app/pagamento/[slug]/page.tsx", "utf8");
const questionServer = readFileSync("lib/questions-main-server.ts", "utf8");

beforeEach(() => vi.stubEnv("BUILD_OFFLINE", "true"));

describe("robustez do build da página de pagamento", () => {
  it("não consulta slugs nem contagens externas durante o build", () => {
    expect(paymentPage).toContain('export const dynamic = "force-dynamic"');
    expect(paymentPage).not.toContain("generateStaticParams");
  });

  it("mantém a consulta e resolução de um slug válido em runtime", async () => {
    const laws = await getLegislacoes();
    const valid = laws.find((law) => law.ativo === "Sim");
    expect(valid).toBeDefined();
    expect(encontrarLegislacaoPorSlug(laws, valid!.slug)?.slug).toBe(valid!.slug);
    expect(paymentPage).toContain("withActiveQuestionCounts(await getLegislacoes())");
  });

  it("mantém notFound para slug inválido", async () => {
    expect(encontrarLegislacaoPorSlug(await getLegislacoes(), "slug-inexistente-para-teste")).toBeUndefined();
    expect(paymentPage).toContain("if (!legislacao)");
    expect(paymentPage).toContain("notFound()");
  });

  it("mantém o timeout do Supabase visível em runtime sem expor o build a ele", () => {
    expect(questionServer).toContain("Não foi possível localizar as leis: ${lawsError.message}");
    expect(questionServer).toContain('.from("leis").select("id,slug")');
    expect(paymentPage.slice(paymentPage.indexOf("export default"))).not.toContain("try {");
  });
});
