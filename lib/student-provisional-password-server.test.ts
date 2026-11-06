import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "auth_failure" as "auth_failure" | "oauth_only",
  markedForChange: false,
  auditInserted: false,
  authPasswordUpdated: false,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "alunos") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "00000000-0000-4000-8000-000000000001", user_id: "00000000-0000-4000-8000-000000000002", nome: "Teste", email: "descartavel@example.test" }, error: null }),
            }),
            ilike: async () => ({ data: [{ id: "00000000-0000-4000-8000-000000000001", email: "descartavel@example.test" }], error: null }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              if (patch.deve_trocar_senha === true) state.markedForChange = true;
              return { error: null };
            },
          }),
        };
      }
      if (table === "auditoria_administrativa") {
        return {
          insert: async () => {
            state.auditInserted = true;
            return { error: null };
          },
        };
      }
      throw new Error(`Tabela não esperada: ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { identities: [{ provider: state.mode === "oauth_only" ? "google" : "email" }], app_metadata: {} } }, error: null }),
        updateUserById: async () => {
          state.authPasswordUpdated = true;
          return { error: { message: "falha simulada no Auth" } };
        },
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  }),
}));
vi.mock("server-only", () => ({}));

import { generateStudentProvisionalPassword } from "./student-provisional-password-server";

const studentId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000003";

describe("geração administrativa de senha provisória", () => {
  beforeEach(() => {
    state.mode = "auth_failure";
    state.markedForChange = false;
    state.auditInserted = false;
    state.authPasswordUpdated = false;
  });

  it("não retorna senha nem audita sucesso quando o Auth falha após a marcação", async () => {
    await expect(generateStudentProvisionalPassword(studentId, adminId)).rejects.toMatchObject({
      status: 500,
      message: "Não foi possível atualizar a senha da conta Auth.",
    });
    expect(state.markedForChange).toBe(true);
    expect(state.authPasswordUpdated).toBe(true);
    expect(state.auditInserted).toBe(false);
  });

  it("recusa OAuth exclusivo antes de marcar a troca ou alterar o Auth", async () => {
    state.mode = "oauth_only";
    await expect(generateStudentProvisionalPassword(studentId, adminId)).rejects.toMatchObject({ status: 422 });
    expect(state.markedForChange).toBe(false);
    expect(state.authPasswordUpdated).toBe(false);
    expect(state.auditInserted).toBe(false);
  });
});
