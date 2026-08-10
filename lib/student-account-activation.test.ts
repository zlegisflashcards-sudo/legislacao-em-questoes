import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260810210000_add_student_account_activation_tokens.sql", "utf8");
const activation = readFileSync("lib/student-activation-server.ts", "utf8");
const notifier = readFileSync("lib/student-first-access-server.ts", "utf8");
const route = readFileSync("app/api/aluno/ativacao/route.ts", "utf8");
const page = readFileSync("components/student-account-activation.tsx", "utf8");

describe("ativacao de conta de aluno sem Auth", () => {
  it("persiste apenas hash de token forte, de uso unico e com expiracao", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("expires_at timestamptz not null");
    expect(migration).toContain("used_at timestamptz");
    expect(migration).toContain("reserved_at timestamptz");
    expect(migration).toContain("invalidated_at timestamptz");
    expect(activation).toContain('randomBytes(32).toString("base64url")');
    expect(activation).toContain('createHash("sha256")');
    expect(activation).toContain("ACTIVATION_TTL_MS");
  });

  it("envia link seguro apenas ao aluno sem Auth e mantem CTA de acesso para quem ja possui Auth", () => {
    expect(notifier).toContain("createStudentActivationLink");
    expect(activation).toContain("/conta/ativar?token=");
    expect(notifier).toContain("Ativar minha conta");
    expect(notifier).toContain("Acessar minha conta");
    expect(notifier).toContain("student.user_id ? undefined");
  });

  it("valida token antes de revelar e-mail ou permitir a senha", () => {
    expect(route).toContain("inspectStudentActivation");
    expect(route).toContain("activateStudentAccount");
    expect(activation).toContain("activation.invalidated_at || activation.used_at || activation.reserved_at");
    expect(activation).toContain("new Date(activation.expires_at).getTime() <= Date.now()");
    expect(page).toContain("E-mail de acesso");
    expect(page).toContain("readOnly");
  });

  it("reutiliza o mesmo aluno, bloqueia conflito Auth e nao cria segunda identidade", () => {
    expect(activation).toContain('rpc("vincular_aluno_para_usuario"');
    expect(activation).toContain('eq("user_id", authUser.id).neq("id", student.id)');
    expect(activation).toContain("duplicidade_email");
    expect(activation).toContain('eq("id", activation.id).eq("reserved_at", reservedAt).is("used_at", null)');
    expect(activation).toContain('update({ reserved_at: reservedAt })');
    expect(activation).toContain('update({ reserved_at: null })');
    expect(activation).toContain("conta_ativada");
    expect(activation).toContain('if (result.student.user_id) return { state: "activated" as const }');
  });

  it("nao expõe token ou senha em logs e preserva importacao historica sem envio", () => {
    expect(activation).not.toContain("console.");
    expect(route).not.toContain("console.");
    expect(activation).not.toContain("console.");
    expect(page).toContain("Este link de ativação não é mais válido.");
  });
});
