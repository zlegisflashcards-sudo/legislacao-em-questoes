import { QUESTION_EDITABLE_FIELDS, parseQuestionFieldChange, type QuestionDraft, type QuestionEditableField } from "@/lib/admin-questoes";

export const BULK_QUESTION_EDIT_SCOPES = ["selected", "results", "all"] as const;
export type BulkQuestionEditScope = (typeof BULK_QUESTION_EDIT_SCOPES)[number];

export const QUESTION_BULK_FIELD_LABELS: Record<QuestionEditableField, string> = {
  structure_id: "Estrutura",
  pergunta: "Pergunta",
  resposta: "Resposta",
  justificativa: "Justificativa",
  assunto: "Assunto",
  legislacao: "Legislação",
  ordem: "Ordem",
  titulo: "Título legado",
  total_artigos: "Total de artigos",
  capitulo: "Capítulo legado",
  secao: "Seção legada",
  subsecao: "Subseção legada",
  artigo: "Artigo",
};

export function parseBulkQuestionEdit(input: Record<string, unknown>): { scope: BulkQuestionEditScope; field: QuestionEditableField; value: QuestionDraft[QuestionEditableField] } {
  if (!BULK_QUESTION_EDIT_SCOPES.includes(input.scope as BulkQuestionEditScope)) throw new Error("Abrangência de edição em lote inválida.");
  if (!QUESTION_EDITABLE_FIELDS.includes(input.field as QuestionEditableField)) throw new Error("Campo não permitido para edição em lote.");
  const field = input.field as QuestionEditableField;
  return { scope: input.scope as BulkQuestionEditScope, field, value: parseQuestionFieldChange(field, input.value) };
}

export function questionFieldDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(vazio)";
  return String(value);
}
