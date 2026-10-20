import { describe, expect, it } from "vitest";
import { canLoadContinuousPage, completedContinuousPage } from "./continuous-reading-pagination";

describe("paginação da leitura contínua", () => {
  it("não repete uma página que respondeu com sucesso, mesmo sem blocos", () => {
    const loaded = completedContinuousPage(new Set(), 1);
    expect(canLoadContinuousPage({ page: 1, preparedCount: 90, pageSize: 30, loadedPages: loaded, loadingPages: new Set() })).toBe(false);
  });

  it("mantém uma página com falha elegível para retry controlado", () => {
    expect(canLoadContinuousPage({ page: 1, preparedCount: 90, pageSize: 30, loadedPages: new Set(), loadingPages: new Set() })).toBe(true);
  });

  it("não solicita páginas fora do snapshot atual nem em voo", () => {
    expect(canLoadContinuousPage({ page: 3, preparedCount: 90, pageSize: 30, loadedPages: new Set(), loadingPages: new Set() })).toBe(false);
    expect(canLoadContinuousPage({ page: 1, preparedCount: 90, pageSize: 30, loadedPages: new Set(), loadingPages: new Set([1]) })).toBe(false);
  });
});
