import { describe, expect, it } from "vitest";
import { adminLawConferenceFilter, adminLawConferenceStatus } from "./admin-law-listing";

describe("filtro administrativo de conferência das leis", () => {
  it("normaliza o filtro e o converte para o status administrativo persistido", () => {
    expect(adminLawConferenceFilter("invalido")).toBe("todas");
    expect(adminLawConferenceStatus("todas")).toBeNull();
    expect(adminLawConferenceStatus("para_conferir")).toBe("para_conferir");
    expect(adminLawConferenceStatus("conferida")).toBe("conferido");
  });
});
