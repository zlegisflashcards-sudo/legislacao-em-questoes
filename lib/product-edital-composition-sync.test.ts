import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260818100000_sync_active_edital_product_composition.sql", "utf8");
const reconciliationMigration = readFileSync("supabase/migrations/20260818113000_fix_edital_release_reconciliation.sql", "utf8");
const adminServer = readFileSync("lib/commercial-admin-server.ts", "utf8");
const adminClient = readFileSync("components/admin/commercial-admin.tsx", "utf8");

type Purchase = { id: string; studentId: string; productId: string; status: "ativo" | "cancelado" | "reembolsado" };
type Release = { purchaseId: string; lawId: number; origin: string };

function synchronize(productId: string, laws: number[], purchases: Purchase[], releases: Release[]) {
  const result = [...releases];
  for (const purchase of purchases.filter((item) => item.productId === productId && item.status === "ativo")) {
    for (const lawId of laws) if (!result.some((release) => release.purchaseId === purchase.id && release.lawId === lawId)) result.push({ purchaseId: purchase.id, lawId, origin: "produto" });
  }
  return result;
}

function productExam(productId: string, laws: number[], purchases: Purchase[]) {
  return purchases.some((item) => item.productId === productId && item.status === "ativo") ? laws : [];
}

describe("sincronização da composição viva de edital", () => {
  it("cria somente as liberações faltantes de compradores ativos e é idempotente", () => {
    const purchases = [{ id: "compra-a", studentId: "aluno-a", productId: "produto-x", status: "ativo" as const }];
    const initial = [{ purchaseId: "compra-a", lawId: 1, origin: "produto" }, { purchaseId: "compra-a", lawId: 2, origin: "produto" }, { purchaseId: "compra-a", lawId: 3, origin: "produto" }];
    const afterAdd = synchronize("produto-x", [1, 2, 3, 4], purchases, initial);
    expect(afterAdd).toHaveLength(4);
    expect(afterAdd.filter((item) => item.lawId === 4)).toHaveLength(1);
    expect(synchronize("produto-x", [1, 2, 3, 4], purchases, afterAdd)).toEqual(afterAdd);
  });

  it("remove somente a lei da composição dinâmica e preserva liberações e progresso", () => {
    const purchases = [{ id: "compra-a", studentId: "aluno-a", productId: "produto-x", status: "ativo" as const }];
    const releases = [{ purchaseId: "compra-a", lawId: 1, origin: "produto" }, { purchaseId: "compra-a", lawId: 2, origin: "produto" }];
    const progress = new Map([[1, { study: true }], [2, { review: true }]]);
    expect(productExam("produto-x", [1], purchases)).toEqual([1]);
    expect(releases).toEqual([{ purchaseId: "compra-a", lawId: 1, origin: "produto" }, { purchaseId: "compra-a", lawId: 2, origin: "produto" }]);
    expect(progress.get(2)).toEqual({ review: true });
    expect(productExam("produto-x", [1, 2], purchases)).toEqual([1, 2]);
    expect(progress.get(2)).toEqual({ review: true });
  });

  it("reflete a ordem atual e isola cada edital por UUID de produto", () => {
    const purchases = [
      { id: "compra-x", studentId: "aluno-a", productId: "produto-x", status: "ativo" as const },
      { id: "compra-y", studentId: "aluno-a", productId: "produto-y", status: "ativo" as const },
    ];
    expect(productExam("produto-x", [3, 1, 4], purchases)).toEqual([3, 1, 4]);
    expect(productExam("produto-y", [5, 6], purchases)).toEqual([5, 6]);
  });

  it("não concede leis novas para compras sem acesso e não interfere em outra origem", () => {
    const purchases = [
      { id: "ativa", studentId: "aluno-a", productId: "produto-x", status: "ativo" as const },
      { id: "cancelada", studentId: "aluno-b", productId: "produto-x", status: "cancelado" as const },
      { id: "reembolsada", studentId: "aluno-c", productId: "produto-x", status: "reembolsado" as const },
    ];
    const releases = [{ purchaseId: "outra-compra", lawId: 9, origin: "hotmart" }];
    const result = synchronize("produto-x", [7], purchases, releases);
    expect(result).toContainEqual({ purchaseId: "ativa", lawId: 7, origin: "produto" });
    expect(result).not.toContainEqual({ purchaseId: "cancelada", lawId: 7, origin: "produto" });
    expect(result).not.toContainEqual({ purchaseId: "reembolsada", lawId: 7, origin: "produto" });
    expect(result).toContainEqual({ purchaseId: "outra-compra", lawId: 9, origin: "hotmart" });
  });

  it("não deixa uma compra ativa órfã bloquear compradores ativos válidos", () => {
    const purchases = [
      { id: "valida", studentId: "aluno-a", productId: "produto-x", status: "ativo" as const },
      { id: "orfã", studentId: "", productId: "produto-x", status: "ativo" as const },
    ];
    const validPurchases = purchases.filter((purchase) => purchase.studentId);
    expect(synchronize("produto-x", [8], validPurchases, [])).toEqual([{ purchaseId: "valida", lawId: 8, origin: "produto" }]);
  });
});

describe("contrato SQL da sincronização", () => {
  it("sincroniza após salvar a composição sem apagar direitos ou progresso", () => {
    expect(migration).toContain("admin_sincronizar_composicao_edital_produto");
    expect(migration).toContain("if v_produto.tipo_produto='edital' then");
    expect(migration).toContain("c.status_acesso='ativo'");
    expect(migration).toContain("on conflict (compra_id,lei_id) where compra_id is not null");
    expect(migration).not.toContain("delete from public.liberacoes_leis");
    expect(migration).not.toContain("delete from public.progresso_leis_alunos");
    expect(migration).not.toContain("update public.progresso_leis_alunos");
  });

  it("mantém o edital de produto vivo por produto_leis, com ordem e compra ativa", () => {
    expect(migration).toContain("join public.produto_leis pl on pl.produto_id=p.id");
    expect(migration).toContain("order by pl.ordem,l.id");
    expect(migration).toContain("c.produto_id=p.id and c.status_acesso='ativo'");
    expect(migration).toContain("'id',p.id::text");
    expect(migration).not.toContain("insert into public.editais_personalizados_leis");
    expect(migration).not.toContain("materiais_leis");
  });

  it("filtra compras órfãs e permite reconciliar a composição já salva", () => {
    expect(reconciliationMigration).toContain("and c.aluno_id is not null");
    expect(reconciliationMigration).toContain("compras_sem_aluno_ignoradas");
    expect(adminServer).toContain('"sincronizar_liberacoes_editais"');
    expect(adminServer).toContain('rpc("admin_sincronizar_composicao_edital_produto"');
    expect(adminClient).toContain("Sincronizar compras ativas");
    expect(reconciliationMigration).toContain("admin_reconciliar_liberacoes_editais_ativos");
    expect(reconciliationMigration).toContain("'todos_editais'");
  });
});
