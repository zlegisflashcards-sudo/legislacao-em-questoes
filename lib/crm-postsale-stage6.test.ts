import { describe, expect, it } from "vitest";
import { CRM_STAGE3_FINAL_CONFIRMATION_OBSERVATION, isStage3CompletionFromFinalConfirmation, shouldAutoCompleteStage3AfterFinalConfirmation } from "./crm-postsale-stage6";

describe("conclusão da Etapa 3 pelo retorno final", () => {
  it("conclui a Etapa 3 pendente somente quando o cliente confirma", () => {
    expect(shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome: "cliente_confirmou", emailSent: false, stage3Completed: false })).toBe(true);
    expect(shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome: "nao_respondeu", emailSent: false, stage3Completed: false })).toBe(false);
  });

  it("não duplica uma Etapa 3 já concluída, automática ou por e-mail", () => {
    expect(shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome: "cliente_confirmou", emailSent: true, stage3Completed: false })).toBe(false);
    expect(shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome: "cliente_confirmou", emailSent: false, stage3Completed: true })).toBe(false);
  });

  it("identifica no histórico a conclusão automática vinculada à própria compra", () => {
    expect(isStage3CompletionFromFinalConfirmation(3, CRM_STAGE3_FINAL_CONFIRMATION_OBSERVATION)).toBe(true);
    expect(isStage3CompletionFromFinalConfirmation(6, CRM_STAGE3_FINAL_CONFIRMATION_OBSERVATION)).toBe(false);
  });
});
