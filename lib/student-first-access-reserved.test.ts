import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activation: vi.fn() }));
vi.mock("@/lib/student-activation-server", () => ({ createStudentActivationLink: mocks.activation, findAuthUserByEmail: vi.fn() }));
vi.mock("@/lib/admin-notification-server", () => ({ createOperationalAdminNotification: vi.fn() }));

import { deliverReservedStudentAccessEmail } from "@/lib/student-first-access-server";

function db(student: { id: string; user_id: string | null; nome: string | null; email: string }) {
  return { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: student, error: null }) })) })) })) } as never;
}

describe("envio reservado de acesso", () => {
  beforeEach(() => { process.env.RESEND_API_KEY = "test-key"; process.env.RESEND_FROM_EMAIL = "test@example.com"; });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("envia uma vez para aluno com Auth sem criar link ou senha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" }), { status: 200 })));
    const result = await deliverReservedStudentAccessEmail(db({ id: "a", user_id: "auth-a", nome: "Ana", email: "ana@example.com" }), "a", { accessLabel: "Produto", idempotencyKey: "k", origin: "test", eventId: "k", identityReserved: true });
    expect(result.sent).toBe(true); expect(fetch).toHaveBeenCalledTimes(1); expect(mocks.activation).not.toHaveBeenCalled();
  });

  it("cria somente um link de ativação para aluno sem Auth", async () => {
    mocks.activation.mockResolvedValue("https://example.test/ativar?token=x");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    const result = await deliverReservedStudentAccessEmail(db({ id: "b", user_id: null, nome: "Bia", email: "bia@example.com" }), "b", { accessLabel: "Produto", idempotencyKey: "k", origin: "test", eventId: "k", identityReserved: true });
    expect(result.sent).toBe(true); expect(mocks.activation).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("propaga falha do provider sem vazar detalhes ao chamador de lote", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limit interno", { status: 429 })));
    await expect(deliverReservedStudentAccessEmail(db({ id: "c", user_id: "auth-c", nome: "Caio", email: "caio@example.com" }), "c", { accessLabel: "Produto", idempotencyKey: "k", origin: "test", eventId: "k", identityReserved: true })).rejects.toThrow("HTTP 429");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
