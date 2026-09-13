import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), admin: vi.fn(), isAdmin: vi.fn(), cookie: vi.fn(), released: true, dbError: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: mocks.admin, usuarioEhAdministrador: mocks.isAdmin, adminCookieNames: { access: "legisbot_admin_access" } }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }), createSupabaseUserClient: () => ({ rpc: async () => ({ data: [], error: null }) }) }));
vi.mock("@/lib/question-counts-server", () => ({ activeQuestionCountBySlug: async () => 10 }));
vi.mock("@/lib/questions-main-server", () => ({ mainQuestions: async () => [{ id: "q1", resposta: "Certo" }], mainStructure: async () => [], mainQuestionsByIds: vi.fn(), mainQuestionById: vi.fn() }));
import { GET } from "../app/api/aluno/estudar/lei/[slug]/route";
import { authorizeLawStudy } from "./law-study-server";
import { GET as studentLawsGET } from "../app/api/aluno/minhas-leis/route";
import { answerCampaign, resetCampaign, startCampaign } from "./law-campaign-server";

function request(token: string | null = "student-token", cookie = "") {
  return new Request("http://localhost/api/aluno/estudar/lei/cf", { headers: {
    ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie, "User-Agent": "Mobile Safari" } : {}),
  } });
}
function route(req = request()) { return GET(req, { params: Promise.resolve({ slug: "cf" }) }); }

beforeEach(() => {
  vi.clearAllMocks(); mocks.released = true; mocks.dbError = false;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mocks.admin.mockResolvedValue(null); mocks.isAdmin.mockReturnValue(false); mocks.cookie.mockReturnValue({ value: "admin-token" });
  mocks.from.mockImplementation((table: string) => {
    let fields = "";
    const result = () => ({ error: mocks.dbError ? { message: "database unavailable" } : null, data:
      table === "alunos" ? fields === "id" ? { id: "student-1" } : { deve_trocar_senha: false }
      : table === "leis" ? { id: 1, slug: "cf", titulo: "Constituição Federal" }
      : table === "liberacoes_leis" ? mocks.released ? [{ id: 1 }] : []
      : table === "progresso_leis_alunos" ? null : [] });
    const query: Record<string, unknown> = {};
    query.select = (value: string) => { fields = value; return query; };
    for (const method of ["eq", "order", "in"]) query[method] = () => query;
    for (const method of ["maybeSingle", "single", "limit"]) query[method] = async () => result();
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  });
});

describe("reprodução server-side da regressão de aluno", () => {
  it("aluno comum com sessão válida e lei liberada recebe 200 sem consultar ADM", async () => {
    expect((await route()).status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledWith("student-token");
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.isAdmin).not.toHaveBeenCalled();
    expect((await authorizeLawStudy(request(), "cf")).accessKind).toBe("student");
  });
  it("aluno comum válido sem liberação recebe 403, nunca sessão expirada", async () => {
    mocks.released = false;
    const response = await route(); expect(response.status).toBe(403);
    expect((await response.json()).message).not.toMatch(/sessão expir/i);
  });
  it("sessão expirada recebe 401 sem substituir Bearer por cookie ADM", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, code: "bad_jwt" } });
    mocks.admin.mockResolvedValue({ id: "admin-1" });
    expect((await route(request("expired", "legisbot_admin_access=existing"))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("falha interna do Supabase Auth recebe 500 e não diz sessão expirada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 500 } });
    const response = await route(); expect(response.status).toBe(500);
    expect((await response.json()).message).not.toMatch(/sessão expir/i);
  });
  it("falha no banco recebe 500 e não vira autenticação inválida", async () => {
    mocks.dbError = true; expect((await route()).status).toBe(500);
  });
  it("ADM com aluno e liberação usa fluxo normal", async () => {
    mocks.isAdmin.mockReturnValue(true);
    expect((await authorizeLawStudy(request(), "cf"))).toMatchObject({ studentId: "student-1", accessKind: "student" });
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });
  it("ADM sem liberação usa fallback sem aluno_id para persistência", async () => {
    mocks.released = false; mocks.isAdmin.mockReturnValue(true);
    expect((await route()).status).toBe(200);
    expect((await authorizeLawStudy(request(), "cf"))).toMatchObject({ studentId: null, accessKind: "admin" });
  });
  it("mobile com cookies ADM existentes preserva token e fluxo do aluno", async () => {
    mocks.admin.mockResolvedValue({ id: "different-admin" });
    expect((await route(request("student-token", "legisbot_admin_access=old; sb-session=existing"))).status).toBe(200);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.cookie).not.toHaveBeenCalled();
    expect(mocks.getUser).toHaveBeenCalledWith("student-token");
  });
  it("sem Bearer permite apenas cookie ADM realmente validado no servidor", async () => {
    expect((await route(request(null))).status).toBe(401);
    mocks.admin.mockResolvedValue({ id: "admin-1" }); mocks.released = false;
    expect((await route(request(null, "legisbot_admin_access=valid"))).status).toBe(200);
  });
  it("a autorização só faz leituras, não cria compra, liberação nem aluno", async () => {
    mocks.released = false; mocks.isAdmin.mockReturnValue(true); await route();
    expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain("compras");
    expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain("aluno_produtos");
  });
  it("Minhas leis também aceita Bearer válido e ignora cookies administrativos", async () => {
    expect((await studentLawsGET(request("student-token", "legisbot_admin_access=old"))).status).toBe(200);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([401, 500])("Minhas leis preserva a distinção do erro Auth %i", async (status) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status } });
    expect((await studentLawsGET(request())).status).toBe(status);
  });
  it("prévia ADM inicia, responde e reseta sem tocar progresso, compras ou ranking", async () => {
    mocks.released = false; mocks.isAdmin.mockReturnValue(true);
    expect(await startCampaign(request(), "cf")).toMatchObject({ administrativePreview: true });
    expect(await answerCampaign(request(), "cf", { questionId: "q1", answer: "certo", idempotencyKey: "11111111-1111-4111-8111-111111111111" })).toMatchObject({ administrativePreview: true, score: 0 });
    await resetCampaign(request(), "cf");
    expect(mocks.from.mock.calls.map(([table]) => table).every((table) => ["alunos", "leis", "liberacoes_leis"].includes(table))).toBe(true);
  });
});
