import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isCompositeLawProduct } from "./product-types";

const migration = readFileSync("supabase/migrations/20260925100000_generalize_composite_law_products.sql", "utf8");

type Purchase = { id: string; productId: string; active: boolean };
type Release = { purchaseId: string; lawId: number };

function synchronize(type: string, productId: string, laws: number[], purchases: Purchase[], releases: Release[]) {
  if (!isCompositeLawProduct(type)) return releases;
  return purchases.filter((purchase) => purchase.productId === productId && purchase.active).reduce((result, purchase) => [
    ...result,
    ...laws.filter((lawId) => !result.some((release) => release.purchaseId === purchase.id && release.lawId === lawId)).map((lawId) => ({ purchaseId: purchase.id, lawId })),
  ], [...releases]);
}

describe("produtos compostos por leis", () => {
  it("mantém edital como produto composto", () => expect(isCompositeLawProduct("edital")).toBe(true));

  it("libera todas as leis de um combo", () => {
    expect(synchronize("combo", "combo-a", [1, 2], [{ id: "compra", productId: "combo-a", active: true }], [])).toEqual([
      { purchaseId: "compra", lawId: 1 }, { purchaseId: "compra", lawId: 2 },
    ]);
  });

  it("sincroniza a nova lei do combo sem duplicar a liberação existente", () => {
    const purchases = [{ id: "compra", productId: "combo-a", active: true }];
    const first = synchronize("combo", "combo-a", [1], purchases, []);
    expect(synchronize("combo", "combo-a", [1, 2], purchases, first)).toEqual([
      { purchaseId: "compra", lawId: 1 }, { purchaseId: "compra", lawId: 2 },
    ]);
  });

  it("remove uma lei somente da composição, preservando a liberação e o progresso histórico", () => {
    const history = { releases: [{ purchaseId: "compra", lawId: 2 }], progress: new Map([[2, "concluída"]]) };
    expect([1]).not.toContain(2);
    expect(history.releases).toEqual([{ purchaseId: "compra", lawId: 2 }]);
    expect(history.progress.get(2)).toBe("concluída");
  });

  it("não altera produto avulso", () => {
    const releases = [{ purchaseId: "compra", lawId: 1 }];
    expect(synchronize("lei_avulsa", "avulso", [1, 2], [{ id: "compra", productId: "avulso", active: true }], releases)).toEqual(releases);
  });
});

describe("contrato da composição compartilhada", () => {
  it("centraliza a regra SQL e a usa em acesso, sincronização e Meu Edital", () => {
    expect(migration).toContain("is_composite_law_product");
    expect(migration).toContain("p_type in ('edital','combo')");
    expect(migration).toContain("public.is_composite_law_product(v_produto.tipo_produto)");
    expect(migration).toContain("public.is_composite_law_product(p.tipo_produto)");
    expect(migration).not.toContain("delete from public.liberacoes_leis");
    const compositionMutation = migration.slice(migration.indexOf("create or replace function public.admin_definir_leis_produto_recortes"), migration.indexOf("create or replace function public.admin_reconciliar_liberacoes_editais_ativos"));
    expect(compositionMutation).not.toContain("progresso_leis_alunos");
  });
});
