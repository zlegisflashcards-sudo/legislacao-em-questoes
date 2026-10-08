export const QUESTION_ANSWERS = ["Certo", "Errado"] as const;
export const QUESTION_LONG_CONTENT_MAX_LENGTH = 60_000;

export type QuestionAnswer = (typeof QUESTION_ANSWERS)[number];

export type QuestionDraft = {
  structure_id: number | null;
  pergunta: string;
  resposta: QuestionAnswer;
  justificativa: string | null;
  assunto: string | null;
  legislacao: string | null;
  ordem: string;
  titulo: string | null;
  total_artigos: number | null;
  capitulo: string | null;
  secao: string | null;
  subsecao: string | null;
  artigo: string | null;
};

export const QUESTION_EDITABLE_FIELDS = ["structure_id", "pergunta", "resposta", "justificativa", "assunto", "legislacao", "ordem", "titulo", "total_artigos", "capitulo", "secao", "subsecao", "artigo"] as const;
export type QuestionEditableField = (typeof QUESTION_EDITABLE_FIELDS)[number];

type DraftInput = Record<string, unknown>;

function text(value: unknown, field: string, required = false, max = 12000) {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field} é obrigatório.`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${field} inválido.`);
  const normalized = value.trim();
  if (!normalized) {
    if (required) throw new Error(`${field} é obrigatório.`);
    return null;
  }
  if (normalized.length > max) throw new Error(`${field} excede o limite permitido.`);
  return normalized;
}

function optionalInteger(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} inválido.`);
  return number;
}

function order(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string" || !/^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/.test(value.trim())) throw new Error("Ordem inválido.");
  return value.trim();
}

export function parseQuestionFieldChange(field: QuestionEditableField, value: unknown): QuestionDraft[QuestionEditableField] {
  switch (field) {
    case "structure_id": return optionalInteger(value, "Estrutura");
    case "pergunta": return text(value, "Pergunta", true)!;
    case "resposta": {
      const resposta = text(value, "Resposta", true, 20);
      if (!QUESTION_ANSWERS.includes(resposta as QuestionAnswer)) throw new Error("Resposta deve ser Certo ou Errado.");
      return resposta as QuestionAnswer;
    }
    case "ordem": return order(value);
    case "justificativa": return text(value, "Justificativa", false, QUESTION_LONG_CONTENT_MAX_LENGTH);
    case "assunto": return text(value, "Assunto", false, 500);
    case "legislacao": return text(value, "Legislação", false, QUESTION_LONG_CONTENT_MAX_LENGTH);
    case "titulo": return text(value, "Título", false, 500);
    case "total_artigos": return optionalInteger(value, "Total de artigos");
    case "capitulo": return text(value, "Capítulo", false, 500);
    case "secao": return text(value, "Seção", false, 500);
    case "subsecao": return text(value, "Subseção", false, 500);
    case "artigo": return text(value, "Artigo", false, 500);
  }
}

export function parseQuestionDraft(input: DraftInput): QuestionDraft {
  return {
    structure_id: parseQuestionFieldChange("structure_id", input.structure_id) as QuestionDraft["structure_id"],
    pergunta: parseQuestionFieldChange("pergunta", input.pergunta) as QuestionDraft["pergunta"],
    resposta: parseQuestionFieldChange("resposta", input.resposta) as QuestionDraft["resposta"],
    justificativa: parseQuestionFieldChange("justificativa", input.justificativa) as QuestionDraft["justificativa"],
    assunto: parseQuestionFieldChange("assunto", input.assunto) as QuestionDraft["assunto"],
    legislacao: parseQuestionFieldChange("legislacao", input.legislacao) as QuestionDraft["legislacao"],
    ordem: parseQuestionFieldChange("ordem", input.ordem) as QuestionDraft["ordem"],
    titulo: parseQuestionFieldChange("titulo", input.titulo) as QuestionDraft["titulo"],
    total_artigos: parseQuestionFieldChange("total_artigos", input.total_artigos) as QuestionDraft["total_artigos"],
    capitulo: parseQuestionFieldChange("capitulo", input.capitulo) as QuestionDraft["capitulo"],
    secao: parseQuestionFieldChange("secao", input.secao) as QuestionDraft["secao"],
    subsecao: parseQuestionFieldChange("subsecao", input.subsecao) as QuestionDraft["subsecao"],
    artigo: parseQuestionFieldChange("artigo", input.artigo) as QuestionDraft["artigo"],
  };
}

export function nextQuestionOrder(currentOrder: number) {
  return Math.max(0, Math.trunc(currentOrder)) + 1;
}

export function lawDisplayName(law: { codigo?: string | null; titulo: string; nome_curto?: string | null }) {
  const prefix = law.codigo?.trim() || law.nome_curto?.trim();
  return prefix ? `${prefix} — ${law.titulo}` : law.titulo;
}
