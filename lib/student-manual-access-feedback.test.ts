import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/student-activation-server", () => ({ createStudentActivationLink: vi.fn(), findAuthUserByEmail: vi.fn() }));
vi.mock("@/lib/admin-notification-server", () => ({ createOperationalAdminNotification: mocks.notify }));
import { sendManualStudentAccessEmail } from "@/lib/student-first-access-server";

function database() {
  const audit = vi.fn().mockResolvedValue({ error: null });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const student = { id: "student", user_id: "auth", nome: "Aluno", email: "aluno@example.test" };
  const from = vi.fn((table: string) => {
    if (table === "alunos") return { select: () => ({ eq: () => ({ single: async () => ({ data: student, error: null }) }) }) };
    if (table === "alunos_notificacoes_acesso") return { upsert };
    return { insert: audit };
  });
  return { client: { from } as never, audit, upsert };
}
describe("horário do envio manual aceito pelo provedor", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "test-key"); vi.stubEnv("RESEND_FROM_EMAIL", "test@example.test");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-29T22:00:00Z"));
    vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });
  it("retorna e audita a hora após a confirmação do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { vi.setSystemTime(new Date("2026-10-29T22:00:05Z")); return new Response('{"id":"accepted"}', { status: 200 }); }));
    const db = database();
    const result = await sendManualStudentAccessEmail(db.client, "student", "admin", { purchaseId: "purchase" });
    expect(result).toMatchObject({ sent: true, sentAt: "2026-10-29T22:00:05.000Z" });
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: "email_acesso_manual_enviado", detalhes: expect.objectContaining({ enviado_em: result.sentAt }) }));
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ enviado_em: result.sentAt }), expect.anything());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("não retorna sucesso nem audita envio quando o provedor rejeita", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    const db = database();
    await expect(sendManualStudentAccessEmail(db.client, "student", "admin")).rejects.toThrow("HTTP 429");
    expect(db.audit).not.toHaveBeenCalledWith(expect.objectContaining({ acao: "email_acesso_manual_enviado" }));
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({ acao: "email_acesso_manual_falhou" }));
  });
});
