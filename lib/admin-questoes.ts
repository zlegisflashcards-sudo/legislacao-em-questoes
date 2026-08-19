export const QUESTION_ANSWERS = ["Certo", "Errado"] as const;

export type QuestionAnswer = (typeof QUESTION_ANSWERS)[number];

export type QuestionDraft = {
  structure_id: number | null;
  pergunta: string;
  resposta: QuestionAnswer;
  justificativa: string | null;
  assunto: string | null;
  legislacao: string | null;
  ordem: number;
  titulo: string | null;
  total_artigos: number | null;
  capitulo: string | null;
  secao: string | null;
  subsecao: string | null;
  artigo: string | null;
};

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

export function parseQuestionDraft(input: DraftInput): QuestionDraft {
  const resposta = text(input.resposta, "Resposta", true, 20);
  if (!QUESTION_ANSWERS.includes(resposta as QuestionAnswer)) {
    throw new Error("Resposta deve ser Certo ou Errado.");
  }

  const ordem = optionalInteger(input.ordem, "Ordem");
  if (ordem === null) throw new Error("Ordem é obrigatória.");

  return {
    structure_id: optionalInteger(input.structure_id, "Estrutura"),
    pergunta: text(input.pergunta, "Pergunta", true)!,
    resposta: resposta as QuestionAnswer,
    justificativa: text(input.justificativa, "Justificativa"),
    assunto: text(input.assunto, "Assunto", false, 500),
    legislacao: text(input.legislacao, "Legislação"),
    ordem,
    titulo: text(input.titulo, "Título", false, 500),
    total_artigos: optionalInteger(input.total_artigos, "Total de artigos"),
    capitulo: text(input.capitulo, "Capítulo", false, 500),
    secao: text(input.secao, "Seção", false, 500),
    subsecao: text(input.subsecao, "Subseção", false, 500),
    artigo: text(input.artigo, "Artigo", false, 500),
  };
}

export function nextQuestionOrder(currentOrder: number) {
  return Math.max(0, Math.trunc(currentOrder)) + 1;
}

export function lawDisplayName(law: { codigo?: string | null; titulo: string; nome_curto?: string | null }) {
  const prefix = law.codigo?.trim() || law.nome_curto?.trim();
  return prefix ? `${prefix} — ${law.titulo}` : law.titulo;
}
