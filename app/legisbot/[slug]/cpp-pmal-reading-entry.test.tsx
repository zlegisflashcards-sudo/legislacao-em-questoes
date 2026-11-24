/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CPP_PMAL_SCOPE_ID } from "@/lib/legisbot/cpp-pmal-reading-policy";

import Page from "./page";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession } } }));
vi.mock("./continuous-reading-authorized-client", () => ({
  ContinuousReadingAuthorizedClient: () => <div>Fluxo integral original</div>,
}));

const fetchMock = vi.fn();
const all = Array.from({ length: 77 }, (_, i) => ({
  id: `artigo-teste-${i}`, structureId: i < 23 ? 608 : 609, label: i === 76 ? "Art. 62" : `Bloco sintético ${i + 1}`, html: "<p>Conteúdo sintético</p>",
}));
let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  fetchMock.mockReset();
  getSession.mockResolvedValue({ data: { session: { access_token: "test-only-token" } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(recorte_id?: string | string[]) {
  const page = await Page({ params: Promise.resolve({ slug: "cpp" }), searchParams: Promise.resolve({ recorte_id }) });
  await act(async () => root.render(page));
}
it("shows only two titles and all 77 certified blocks when opened from the scoped link", async () => {
  fetchMock.mockResolvedValue(Response.json({ blocks: all }));
  await render(CPP_PMAL_SCOPE_ID);
  expect(host.querySelectorAll("section h2")).toHaveLength(2);
  expect(host.querySelectorAll("#titulo-608 article")).toHaveLength(23);
  expect(host.querySelectorAll("#titulo-609 article")).toHaveLength(54);
  expect(host.textContent).toContain("Art. 62");
  expect(host.textContent).not.toContain("Fluxo integral original");
  expect(host.querySelector('a[href*="recorte_id"]')?.getAttribute("href")).toContain(CPP_PMAL_SCOPE_ID);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/legisbot/cpp/pmal-reading?recorte_id=${CPP_PMAL_SCOPE_ID}`, expect.objectContaining({ cache: "no-store" }));
});
it("never falls back to the integral route when access is denied", async () => {
  fetchMock.mockResolvedValue(Response.json({ message: "Recorte indisponível." }, { status: 403 }));
  await render(CPP_PMAL_SCOPE_ID);
  expect(host.textContent).toContain("Recorte indisponível.");
  expect(host.querySelectorAll("article")).toHaveLength(0);
  expect(host.textContent).not.toContain("Fluxo integral original");
});
it("keeps the existing integral route separate; rejects duplicate PMAL params", async () => {
  await render();
  expect(host.textContent).toContain("Fluxo integral original");
  await render([CPP_PMAL_SCOPE_ID, "another"]);
  expect(host.textContent).toContain("Link de recorte inválido");
  expect(fetchMock).not.toHaveBeenCalled();
});
