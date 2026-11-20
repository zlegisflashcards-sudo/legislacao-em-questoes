import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("components/student-account.tsx", "utf8");

describe("entrada gratuita pela conta", () => {
  it("mantém retorno seguro e oferece Google na tela de conta", () => {
    expect(account).toContain('params.get("gratis") === "1"');
    expect(account).toContain("Entre ou crie sua conta para estudar gratuitamente.");
    expect(account).toContain('provider: "google"');
    expect(account).toContain("Entrar com Google");
    expect(account).toContain('callback.searchParams.set("retorno", returnPath)');
  });
});
