import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({ free: false, releases: [] as Array<{ produto_id: string | null }>, links: [] as Array<{ produto_id: string; recorte_id: string | null }> }));
const questionReads = vi.hoisted(() => vi.fn(async () => [{ id: "questao-privada" }]));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        in: async () => ({ data: fixture.links, error: null }),
        maybeSingle: async () => ({ data: table === "alunos" ? { id: "student" } : { id: 1, titulo: "Lei", acesso_gratuito: fixture.free }, error: null }),
        single: async () => ({ data: { deve_trocar_senha: false }, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: fixture.releases, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/questions-main-server", () => ({ mainLawBySlug: async () => ({ id: 1 }), mainQuestions: questionReads }));

import { authorizeLawStudy } from "./law-study-server";
import { GET } from "../app/api/questoes/[slug]/route";

const request = () => new Request("http://localhost/api/questoes/lei", { headers: { Authorization: "Bearer teste" } });

describe("autorização da lei integral na API legada (banco simulado)", () => {
  beforeEach(() => { fixture.free = false; fixture.releases = []; fixture.links = []; questionReads.mockClear(); });

  it("nega acesso sem liberação", async () => {
    await expect(authorizeLawStudy(request(), "lei")).rejects.toMatchObject({ status: 404 });
  });
  it("trata a liberação comercial da lei como acesso integral, mesmo quando o vínculo indica um recorte", async () => {
    fixture.releases = [{ produto_id: "produto" }];
    fixture.links = [{ produto_id: "produto", recorte_id: "recorte" }];
    await expect(authorizeLawStudy(request(), "lei")).resolves.toMatchObject({ lawId: 1 });
  });
  it("bloqueia a URL direta da API antes de carregar questões integrais para quem não tem liberação", async () => {
    const response = await GET(request(), { params: Promise.resolve({ slug: "lei" }) });
    expect(response.status).toBe(404);
    expect(questionReads).not.toHaveBeenCalled();
  });
  it("aceita lei gratuita integral e produto integral", async () => {
    fixture.free = true;
    await expect(authorizeLawStudy(request(), "lei")).resolves.toMatchObject({ lawId: 1 });
    fixture.free = false;
    fixture.releases = [{ produto_id: "produto" }];
    fixture.links = [{ produto_id: "produto", recorte_id: null }];
    await expect(authorizeLawStudy(request(), "lei")).resolves.toMatchObject({ lawId: 1 });
  });
  it("mantém a opção preexistente de doutrina sem herdar gratuidade", async () => {
    fixture.free = true;
    await expect(authorizeLawStudy(request(), "lei", { allowFreeAccess: false })).rejects.toMatchObject({ status: 404 });
    fixture.releases = [{ produto_id: "produto" }];
    await expect(authorizeLawStudy(request(), "lei", { allowFreeAccess: false })).resolves.toMatchObject({ lawId: 1 });
  });
});
