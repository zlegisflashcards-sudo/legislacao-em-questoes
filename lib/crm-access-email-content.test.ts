import { describe, expect, it } from "vitest";
import { defaultAccessEmailEditorial, renderAccessEmail, validateAccessEmailEditorial } from "@/lib/crm-access-email-content";

describe("conteúdo editorial do e-mail CRM", () => {
  it("aceita edição e somente placeholders permitidos", () => {
    const value = validateAccessEmailEditorial({ ...defaultAccessEmailEditorial("first_access"), subject: "Olá, {{nome}}", message: "Produto: {{produto}} · {{email}}" }, "first_access");
    expect(value.subject).toBe("Olá, {{nome}}");
    expect(() => validateAccessEmailEditorial({ ...value, message: "{{token}}" }, "first_access")).toThrow("Placeholder não permitido");
  });

  it("remove HTML fornecido pelo admin e mantém o HTML final sob controle do servidor", () => {
    const value = validateAccessEmailEditorial({ ...defaultAccessEmailEditorial("existing_account"), title: "<script>alert(1)</script>Acesso" }, "existing_account");
    expect(value.title).toBe("alert(1)Acesso");
    expect(renderAccessEmail({ flow: "existing_account", name: "Ana", product: "Curso", email: "ana@example.test", editorial: value, secureUrl: "https://www.legisflashcards.com.br/conta" }).html).not.toContain("<script>");
  });

  it("renderiza CTAs seguros distintos e redige token no snapshot", () => {
    const existing = renderAccessEmail({ flow: "existing_account", name: "Ana", product: "Curso", email: "ana@example.test", secureUrl: "https://www.legisflashcards.com.br/conta" });
    const first = renderAccessEmail({ flow: "first_access", name: "Bia", product: "Curso", email: "bia@example.test", secureUrl: "https://site.test/activate?token=secreto" });
    expect(existing.snapshot.buttonDestination).toBe("account");
    expect(first.snapshot.buttonDestination).toBe("secure_activation");
    expect(first.text).toContain("token=secreto");
    expect(first.snapshot.text).not.toContain("secreto");
  });
});
