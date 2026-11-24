// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LawSearchSelect } from "./law-search-select";

it("encontra e seleciona um produto pelo código ou pelo nome sem acentos", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const products = [{ id: "other", nome: "Outro produto", slug: "outro" }, { id: "pmal", nome: "Polícia Militar de Alagoas (Soldado)", slug: "pmalsd" }];
  function Fixture() {
    const [value, setValue] = useState("");
    return <LawSearchSelect name="produto_id" options={products} value={value} onChange={setValue} />;
  }
  try {
    await act(async () => root.render(<Fixture />));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    for (const text of ["policia militar de alagoas", "pmalsd"]) {
      await act(async () => {
        setValue.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const matches = [...container.querySelectorAll('button[role="option"]')];
      expect(matches.map((item) => item.textContent)).toEqual(["Polícia Militar de Alagoas (Soldado)pmalsd"]);
    }
    await act(async () => container.querySelector<HTMLButtonElement>('button[role="option"]')!.click());
    expect(container.querySelector<HTMLInputElement>('input[name="produto_id"]')?.value).toBe("pmal");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
