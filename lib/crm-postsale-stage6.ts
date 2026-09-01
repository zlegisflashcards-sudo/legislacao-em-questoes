export const CRM_STAGE3_FINAL_CONFIRMATION_OBSERVATION = "Concluída automaticamente após confirmação positiva do cliente na Etapa 6.";

export function shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome, emailSent, stage3Completed }: { finalOutcome: "cliente_confirmou" | "nao_respondeu"; emailSent: boolean; stage3Completed: boolean }) {
  return finalOutcome === "cliente_confirmou" && !emailSent && !stage3Completed;
}

export function isStage3CompletionFromFinalConfirmation(stage: unknown, observation: unknown) {
  return Number(stage) === 3 && observation === CRM_STAGE3_FINAL_CONFIRMATION_OBSERVATION;
}
