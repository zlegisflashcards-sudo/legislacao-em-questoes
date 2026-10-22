import { QUESTION_EDITABLE_FIELDS, parseQuestionFieldChange, type QuestionDraft, type QuestionEditableField } from "@/lib/admin-questoes";

export const BULK_QUESTION_EDIT_SCOPES = ["selected", "results", "all"] as const;
export type BulkQuestionEditScope = (typeof BULK_QUESTION_EDIT_SCOPES)[number];

export const QUESTION_BULK_FIELD_LABELS: Record<QuestionEditableField, string> = {
  structure_id: "Mover para estrutura",
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

/** Campos textuais em que uma substituição literal não altera vínculos nem gabaritos. */
export const QUESTION_TEXT_REPLACE_FIELDS = ["pergunta", "justificativa", "assunto", "legislacao", "titulo", "capitulo", "secao", "subsecao", "artigo"] as const;
export type QuestionTextReplaceField = (typeof QUESTION_TEXT_REPLACE_FIELDS)[number];

export function parseBulkQuestionEdit(input: Record<string, unknown>): { scope: BulkQuestionEditScope; field: QuestionEditableField; value: QuestionDraft[QuestionEditableField] } {
  if (!BULK_QUESTION_EDIT_SCOPES.includes(input.scope as BulkQuestionEditScope)) throw new Error("Abrangência de edição em lote inválida.");
  if (!QUESTION_EDITABLE_FIELDS.includes(input.field as QuestionEditableField)) throw new Error("Campo não permitido para edição em lote.");
  const field = input.field as QuestionEditableField;
  return { scope: input.scope as BulkQuestionEditScope, field, value: parseQuestionFieldChange(field, input.value) };
}

export function parseBulkQuestionTextReplacement(input: Record<string, unknown>): { scope: BulkQuestionEditScope; field: QuestionTextReplaceField; find: string; replace: string } {
  if (!BULK_QUESTION_EDIT_SCOPES.includes(input.scope as BulkQuestionEditScope)) throw new Error("Abrangência de substituição em lote inválida.");
  if (!QUESTION_TEXT_REPLACE_FIELDS.includes(input.field as QuestionTextReplaceField)) throw new Error("Campo não permitido para substituição em lote.");
  if (typeof input.find !== "string" || !input.find.trim() || input.find.length > 12_000) throw new Error("Informe o texto a localizar.");
  if (typeof input.replace !== "string" || input.replace.length > 60_000) throw new Error("Texto substituto inválido.");
  return { scope: input.scope as BulkQuestionEditScope, field: input.field as QuestionTextReplaceField, find: input.find, replace: input.replace };
}

/**
 * Troca somente ocorrências completas: "Lei 13.869" não corresponde ao
 * prefixo de "Lei 13.869/2019". Pontuação e espaços delimitam ocorrências.
 */
export function replaceCompleteQuestionText(source: string, find: string, replace: string) {
  const isReferenceCharacter = (character: string) => /[\p{L}\p{N}_/-]/u.test(character);
  let output = ""; let cursor = 0; let index = source.indexOf(find, cursor);
  while (index >= 0) {
    const before = source[index - 1] ?? ""; const after = source[index + find.length] ?? "";
    output += source.slice(cursor, index);
    output += isReferenceCharacter(before) || isReferenceCharacter(after) ? find : replace;
    cursor = index + find.length;
    index = source.indexOf(find, cursor);
  }
  return output + source.slice(cursor);
}

export function questionFieldDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(vazio)";
  return String(value);
}
