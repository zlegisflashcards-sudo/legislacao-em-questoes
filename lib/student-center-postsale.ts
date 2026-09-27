export type PostSalePurchase = { id: string; aluno_id: string; status_acesso: string | null };

export function postSaleCompletionForPurchase(purchase: PostSalePurchase | null, alunoId: string, compraId: string, at: string) {
  if (!purchase || purchase.id !== compraId || purchase.aluno_id !== alunoId) throw new Error("A compra não pertence ao aluno informado.");
  if (purchase.status_acesso !== "ativo") throw new Error("Somente compras ativas podem receber pós-venda.");
  return { compra_id: compraId, etapa_6_concluida_em: at, updated_at: at };
}
