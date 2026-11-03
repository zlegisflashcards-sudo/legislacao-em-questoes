import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./admin-notification-server", () => ({ createOperationalAdminNotification: vi.fn() }));
import fixture from "./fixtures/p0-local-flow.json";
import { normalizarEventoHotmart } from "./hotmart/webhook";
import { availableLawStudyAccess } from "./law-question-scope-context";
import { hasStudyEntitlement } from "./study-access-policy";

describe("fixtures P0 fictícias (sem banco e sem compra)", () => {
  it("representa acesso gratuito, integral, recortado e ausência de acesso", () => {
    expect(hasStudyEntitlement(false, fixture.laws[0].free)).toBe(true);
    expect(availableLawStudyAccess([{ produto_id: "produto-integral-teste" }], [{ produto_id: "produto-integral-teste", recorte_id: null }]).full).toBe(true);
    const scoped = availableLawStudyAccess([{ produto_id: "produto-recorte-teste" }], [{ produto_id: "produto-recorte-teste", recorte_id: fixture.products[1].recorteId! }]);
    expect(scoped.full).toBe(false);
    expect(scoped.recorteIds).toEqual([fixture.products[1].recorteId]);
    expect(hasStudyEntitlement(false, false)).toBe(false);
  });
  it("normaliza evento de pagamento fictício sem processá-lo ou mudar o histórico", () => {
    const history = structuredClone(fixture.priorProgress);
    const event = normalizarEventoHotmart(fixture.payment);
    expect(event.codigo_transacao).toBe("transacao-ficticia-p0");
    expect(event.status_transacao).toBe("APPROVED");
    expect(event.email_comprador).toBe(fixture.student.email);
    expect(fixture.priorProgress).toEqual(history);
  });
});
