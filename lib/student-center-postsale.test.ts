import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { postSaleCompletionForPurchase } from "@/lib/student-center-postsale";

describe("conclusão de pós-venda na Central do Aluno", () => {
  const alunoId = "00000000-0000-4000-8000-000000000001";
  const compraA = { id: "00000000-0000-4000-8000-000000000010", aluno_id: alunoId, status_acesso: "ativo" };
  const compraB = { id: "00000000-0000-4000-8000-000000000011", aluno_id: alunoId, status_acesso: "ativo" };
  it("gera atualização somente para a compra selecionada quando o aluno possui duas compras ativas", () => {
    const update = postSaleCompletionForPurchase(compraA, alunoId, compraA.id, "2026-09-27T12:00:00.000Z");
    expect(update.compra_id).toBe(compraA.id);
    expect(update.compra_id).not.toBe(compraB.id);
  });
  it("rejeita compra de outro aluno e compra não ativa", () => {
    expect(() => postSaleCompletionForPurchase(compraA, "00000000-0000-4000-8000-000000000002", compraA.id, "2026-09-27T12:00:00.000Z")).toThrow("não pertence");
    expect(() => postSaleCompletionForPurchase({ ...compraB, status_acesso: "reembolsado" }, alunoId, compraB.id, "2026-09-27T12:00:00.000Z")).toThrow("ativas");
  });
  it("persiste os dois históricos e não seleciona compras pelo aluno", () => {
    const server = fs.readFileSync(path.join(process.cwd(), "lib/student-center-server.ts"), "utf8");
    expect(server).toContain('from("compras_pos_venda_historico").insert');
    expect(server).toContain('from("acoes_alunos_historico").insert');
    expect(server).not.toContain('.in("aluno_id", ids).eq("status_acesso", "ativo")');
  });
});
