import { describe, expect, it, vi } from "vitest";
import { createPublicAvailabilityResolver } from "./public-availability";
import { publicAvailabilityResponse } from "./public-availability-route";

const ready = { law: { nome_curto: "CF", titulo: "Constituição" }, integrity: { readingAvailable: true } };
const partial = { law: { nome_curto: null, titulo: "Lei de teste" }, integrity: { readingAvailable: false } };

describe("disponibilidade pública da Lei Interativa", () => {
  it("projeta pronto e preparação sem texto legislativo ou dados privados", async () => {
    const load = vi.fn().mockResolvedValueOnce(ready).mockResolvedValueOnce(partial);
    const resolve = createPublicAvailabilityResolver(load, () => 0, 1);
    await expect(resolve("CF")).resolves.toEqual({ status: "ready", lawName: "CF" });
    await expect(resolve("LEI")).resolves.toEqual({ status: "preparing", lawName: "Lei de teste" });
  });

  it("compartilha cache por slug e deduplica aberturas concorrentes por 30 segundos", async () => {
    let now = 0;
    let release: ((value: typeof ready) => void) | undefined;
    const load = vi.fn(() => new Promise<typeof ready>((resolve) => { release = resolve; }));
    const resolve = createPublicAvailabilityResolver(load, () => now, 30_000);
    const first = resolve("CF");
    const second = resolve("cf");
    expect(load).toHaveBeenCalledOnce();
    release?.(ready);
    await expect(Promise.all([first, second])).resolves.toEqual([{ status: "ready", lawName: "CF" }, { status: "ready", lawName: "CF" }]);
    await resolve("CF");
    expect(load).toHaveBeenCalledOnce();
    now = 30_001;
    const third = resolve("CF");
    release?.(ready);
    await third;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("mapeia ready, preparing, ausência e erro técnico para o contrato HTTP sem cache do navegador", async () => {
    const readyResponse = await publicAvailabilityResponse("cf", async () => ({ status: "ready", lawName: "CF" }));
    const preparingResponse = await publicAvailabilityResponse("lei", async () => ({ status: "preparing", lawName: "Lei" }));
    const missingResponse = await publicAvailabilityResponse("ausente", async () => null);
    const errorResponse = await publicAvailabilityResponse("falha", async () => { throw new Error("offline"); });
    expect(readyResponse.status).toBe(200);
    await expect(readyResponse.json()).resolves.toEqual({ status: "ready", lawName: "CF" });
    await expect(preparingResponse.json()).resolves.toEqual({ status: "preparing", lawName: "Lei" });
    expect(missingResponse.status).toBe(404);
    expect(errorResponse.status).toBe(503);
    for (const response of [readyResponse, preparingResponse, missingResponse, errorResponse]) expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
