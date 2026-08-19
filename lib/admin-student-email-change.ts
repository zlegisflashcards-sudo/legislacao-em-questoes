export type StudentEmailChangePayload = {
  action: "trocar_email_acesso";
  id: string;
  data: {
    email: string;
    confirmacao: string;
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
): StudentEmailChangePayload {
  return {
    action: "trocar_email_acesso",
    id: alunoId,
    data: { email, confirmacao },
  };
}
