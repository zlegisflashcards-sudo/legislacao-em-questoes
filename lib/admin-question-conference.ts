import { plainQuestionText } from "@/lib/admin-question-search";

export type ConferenceAnswerFilter = "all" | "certo" | "errado";
export type ConferenceQuestion = { id: string; resposta: "Certo" | "Errado"; pergunta: string; legislacao: string | null };

export function conferenceQuestions<T extends ConferenceQuestion>(questions: T[], filter: ConferenceAnswerFilter) {
  if (filter === "certo") return questions.filter((question) => question.resposta === "Certo");
  if (filter === "errado") return questions.filter((question) => question.resposta === "Errado");
  return questions;
}

export function conferenceCopyText(question: ConferenceQuestion, lawTitle: string) {
  const statement = String(question.pergunta ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `Conforme o(a) ${plainQuestionText(lawTitle, 500) || "lei selecionada"}, julgue o item a seguir.\n\n${statement}\n\nCerto ou errado?`;
}

export type ConferenceBatchRow = { pergunta: string; resposta: string; justificativa: string; assunto: string; ordem: string; legislacao: string };
export function parseConferenceTable(value: string): ConferenceBatchRow[] {
  const rows = value.replace(/\r\n?/g, "\n").split("\n").filter((row) => row.trim());
  const data = rows.map((row) => row.split("\t"));
  const first = data[0]?.map((cell) => cell.trim().toLocaleLowerCase("pt-BR"));
  const body = first?.join("|") === "pergunta|resposta|justificativa|assunto|ordem|legislação" || first?.join("|") === "pergunta|resposta|justificativa|assunto|ordem|legislacao" ? data.slice(1) : data;
  return body.map((cells) => ({ pergunta: cells[0] ?? "", resposta: cells[1] ?? "", justificativa: cells[2] ?? "", assunto: cells[3] ?? "", ordem: cells[4] ?? "", legislacao: cells[5] ?? "" }));
}
