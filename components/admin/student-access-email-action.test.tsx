import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StudentAccessEmailAction, { accessEmailSuccessMessage } from "./student-access-email-action";

describe("confirmação do e-mail de acesso", () => {
  it("mostra o botão sem afirmar envio antes de uma resposta", () => {
    const html = renderToStaticMarkup(createElement(StudentAccessEmailAction, { studentId: "a", onBusyChange: () => {} }));
    expect(html).toContain("Enviar e-mail de acesso");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });
  it("respeita bloqueio de outra operação", () => {
    const html = renderToStaticMarkup(createElement(StudentAccessEmailAction, { studentId: "a", disabled: true, onBusyChange: () => {} }));
    expect(html).toContain('disabled=""');
  });
  it("usa o instante do servidor no fuso local, não a hora do clique", () => {
    const sentAt = "2026-10-29T22:29:00.000Z";
    const expected = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(sentAt));
    expect(accessEmailSuccessMessage(sentAt)).toBe(`E-mail de acesso enviado às ${expected}.`);
  });
  it("não inventa horário se uma resposta antiga não o informar", () => {
    for (const value of [undefined, null, "invalid", 123]) expect(accessEmailSuccessMessage(value)).toBe("E-mail de acesso enviado. Horário indisponível.");
  });
  it("monta uma ação independente por aluno na Central", () => {
    const source = readFileSync("components/admin/student-center.tsx", "utf8");
    expect(source).toContain('<StudentAccessEmailAction key={detail.student.id} studentId={detail.student.id} disabled={busy} onBusyChange={setBusy}/>');
    expect(source).not.toContain("const sendAccessEmail=");
  });
});
