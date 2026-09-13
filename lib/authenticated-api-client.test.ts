import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { academicResponseMessage, protectedApiFetch } from "./authenticated-api-client";
beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { session: { access_token: "student-token" } }, error: null }); });
describe("identidade e erros no cliente acadêmico", () => {
  it.each([200, 401, 403, 500])("preserva HTTP %i sem trocar token, fazer refresh ou converter status", async (status) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    const response = await protectedApiFetch("/api/aluno/estudar/lei/cf");
    expect(response.status).toBe(status); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/aluno/estudar/lei/cf", expect.objectContaining({ credentials: "same-origin", headers: { Authorization: "Bearer student-token" } }));
  });
  it("mantém requisição sem Bearer para validação de cookie no servidor", async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    await protectedApiFetch("/api/aluno/estudar/lei/cf");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });
  it("falha ao ler sessão não é silenciosamente convertida em sessão expirada", async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: new Error("storage unavailable") });
    await expect(protectedApiFetch("/api/test")).rejects.toThrow("Não foi possível verificar sua sessão agora");
  });
  it("compartilha uma única leitura da sessão entre requisições protegidas simultâneas", async () => {
    let resolveSession: ((value: { data: { session: { access_token: string } }; error: null }) => void) | undefined;
    mocks.session.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    const requests = ["/api/a", "/api/b", "/api/c", "/api/d"].map((path) => protectedApiFetch(path));
    expect(mocks.session).toHaveBeenCalledTimes(1);
    resolveSession?.({ data: { session: { access_token: "student-token" } }, error: null });
    await Promise.all(requests);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(mocks.session).toHaveBeenCalledTimes(1);
  });
  it("somente 401 mostra expiração; 403/500 mantêm mensagens distintas", () => {
    expect(academicResponseMessage(401, null, "erro")).toMatch(/sessão expir/i);
    expect(academicResponseMessage(403, "Sua sessão expirou.", "erro")).toBe("Este conteúdo não está liberado para sua conta.");
    expect(academicResponseMessage(500, "Sua sessão expirou.", "erro")).not.toMatch(/sessão expir/i);
    expect(academicResponseMessage(403, "Sem liberação", "erro")).toBe("Sem liberação");
  });
});
