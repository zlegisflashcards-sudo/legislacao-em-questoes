export function doctrineTopicOrder(value: string | null) {
  if (value === null) return null;
  return /^\d{3}$/.test(value) ? value : undefined;
}

export function doctrineReadPayload<T>(content: { slug: string; titulo: string }, questions: T[], ordem: string | null) {
  return {
    success: true as const,
    contentType: "doutrina" as const,
    topicLabel: "Tópico",
    content,
    ordem,
    questions,
    total: questions.length,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID válido tem prioridade e nunca pode apontar para outro tópico por Ordem.
 * Sem UUID válido, o card antigo pode usar somente Ordem; ausência devolve base. */
export function resolveDoctrineTopicLink(rows: readonly { id: string; ordem: string }[], questionId: string | null, ordem: string | null) {
  if (questionId && UUID.test(questionId)) {
    const found = rows.find((row) => row.id.toLowerCase() === questionId.toLowerCase());
    return found ? found.ordem : null;
  }
  return ordem && /^\d{3}$/.test(ordem) && rows.some((row) => row.ordem === ordem) ? ordem : null;
}
