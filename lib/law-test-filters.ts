export type TestFilter = "all" | "wrong" | "unanswered";
export type CampaignAnswer = { questionId: string; correct: boolean };

/** Recebe somente questões já autorizadas para a lei ou recorte. */
export function filterTestQuestionIds(questionIds: string[], answers: CampaignAnswer[], filter: TestFilter) {
  const answered = new Set(answers.map((item) => item.questionId));
  const wrong = new Set(answers.filter((item) => !item.correct).map((item) => item.questionId));
  if (filter === "wrong") return questionIds.filter((id) => wrong.has(id));
  if (filter === "unanswered") return questionIds.filter((id) => !answered.has(id));
  return questionIds;
}

export function testEmptyMessage(filter: TestFilter) {
  return filter === "wrong" ? "Nenhuma questão errada nesta campanha." : filter === "unanswered" ? "Você já respondeu todas as questões desta campanha." : "Nenhuma questão disponível neste contexto.";
}
