export type StudentEmailChangePayload = {
  action: "trocar_email_acesso";
  id: string;
  data: {
    email: string;
    confirmacao: string;
    remover_conta_vazia?: boolean;
  };
};

/**
 * Keeps the browser request aligned with the administrative API contract.
 * In particular, `data` must remain an object (rather than a JSON string).
 */
export function createStudentEmailChangePayload(
  alunoId: string,
  email: string,
  confirmacao: string,
  removerContaVazia = false,
): StudentEmailChangePayload {
  return {
    action: "trocar_email_acesso",
    id: alunoId,
    data: { email, confirmacao, remover_conta_vazia: removerContaVazia },
  };
}
