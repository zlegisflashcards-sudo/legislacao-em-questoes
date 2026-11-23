import { describe, expect, it } from "vitest";
import { freeProductDetailHref } from "./free-product-detail";
import { freeStudyLoginHref } from "./free-study-access";

const recorteId = "09948964-6c60-48ea-9045-1cd861ec8550";
const law = { lawId: 14, slug: "cf", recorteId, lawFree: false, published: true };
const scope = { id: recorteId, lei_id: 14, ativo: true, status_publicacao: "ativa", acesso_gratuito: true };

describe("acesso gratuito na página do produto", () => {
  it("abre a amostra grátis da CF, não a lei inteira, e preserva o destino no login/cadastro", () => {
    const href = freeProductDetailHref("lei_avulsa", [law], scope);
    expect(href).toBe(`/estudar/lei/cf?recorte_id=${recorteId}`);
    const login = new URL(freeStudyLoginHref(href!), "https://example.test");
    expect(login.pathname).toBe("/conta");
    expect(login.searchParams.get("modo")).toBe("login");
    expect(login.searchParams.get("gratis")).toBe("1");
    expect(login.searchParams.get("retorno")).toBe(href);
  });

  it("preserva acesso pago da CF integral e reconhece lei integral só quando explicitamente grátis", () => {
    expect(freeProductDetailHref("lei_avulsa", [{ ...law, recorteId: null }], scope)).toBeNull();
    expect(freeProductDetailHref("lei_avulsa", [{ ...law, recorteId: null, lawFree: true }], null)).toBe("/estudar/lei/cf");
  });

  it.each([null, { ...scope, ativo: false }, { ...scope, status_publicacao: "em_breve" }, { ...scope, acesso_gratuito: false }, { ...scope, lei_id: 99 }, { ...scope, id: "wrong" }])("nega vínculo não confirmado sem abrir a lei (inclusive se a lei é grátis)", (staleScope) => {
    expect(freeProductDetailHref("lei_avulsa", [{ ...law, lawFree: true }], staleScope)).toBeNull();
  });

  it.each(["", undefined, 0, "../cf"])("não confunde vínculo malformado com lei integral: %s", (malformed) => {
    expect(freeProductDetailHref("lei_avulsa", [{ ...law, lawFree: true, recorteId: malformed }], scope)).toBeNull();
  });

  it("não afeta combos, várias leis ou lei fora de publicação", () => {
    expect(freeProductDetailHref("combo", [law], scope)).toBeNull();
    expect(freeProductDetailHref("lei_avulsa", [law, { ...law, lawId: 15 }], scope)).toBeNull();
    expect(freeProductDetailHref("lei_avulsa", [{ ...law, published: false }], scope)).toBeNull();
  });
});
