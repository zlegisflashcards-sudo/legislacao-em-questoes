export type ExamLawProgress = { correct: number; errors: number; unanswered: number };
export type StudentExamLaw = { id: number; slug: string; titulo: string; ordem: number; recorteId: string | null; recorteNome?: string | null; emEstudo: boolean; revisao: boolean; campaignStatus: "nao_iniciada" | "em_andamento" | "concluida"; progress: ExamLawProgress };
export type StudentExam = { id: string; tipo: "personalizado" | "produto"; nome: string; leis: StudentExamLaw[] };
export function nextExamLawProgress(law: Pick<StudentExamLaw, "emEstudo" | "revisao">, control: "study" | "review") { if (control === "study" && law.revisao) return null; return control === "review" ? { inStudy: true, questionsFinished: !law.revisao } : { inStudy: !law.emEstudo, questionsFinished: false }; }

/**
 * `answers` deve estar ordenado da resposta mais recente para a mais antiga.
 * A primeira resposta de cada questão é o estado final da campanha; eventos
 * anteriores são tentativas de revisão e não podem aumentar a barra.
 */
export function summarizeExamLawProgress(questionIds: string[], answers: Array<{ questionId: string; correct: boolean }>): ExamLawProgress {
  const universe = new Set(questionIds);
  const finalAnswers = new Map<string, boolean>();
  for (const answer of answers) if (universe.has(answer.questionId) && !finalAnswers.has(answer.questionId)) finalAnswers.set(answer.questionId, answer.correct);
  const correct = [...finalAnswers.values()].filter(Boolean).length;
  const errors = finalAnswers.size - correct;
  return { correct, errors, unanswered: Math.max(0, universe.size - finalAnswers.size) };
}

export function selectExamReferenceCampaign(state: { status: "nao_iniciada" | "em_andamento" | "concluida"; campaignId: string | null } | undefined, campaigns: Array<{ id: string; concluded: boolean }>) {
  if (state?.campaignId && campaigns.some((campaign) => campaign.id === state.campaignId)) return state.campaignId;
  return state?.status === "concluida" ? campaigns.find((campaign) => campaign.concluded)?.id ?? null : null;
}

function record(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function optionalUuid(value: unknown) { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null; }
export function parseStudentExams(value: unknown): StudentExam[] {
  const root = record(value); const rows = root?.editais;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item) => { const e=record(item); const tipo=e?.tipo; const leis=e?.leis; if ((tipo!=="personalizado"&&tipo!=="produto") || typeof e?.id!=="string" && typeof e?.id!=="number" || typeof e?.nome!=="string" || !e.nome.trim() || !Array.isArray(leis)) return []; const parsed=leis.flatMap((law)=>{const l=record(law); const id=typeof l?.id==="number"?l.id:NaN; const ordem=typeof l?.ordem==="number"?l.ordem:NaN; if(!Number.isSafeInteger(id)||id<1||typeof l?.slug!=="string"||!l.slug||typeof l?.titulo!=="string"||!l.titulo||!Number.isSafeInteger(ordem)||typeof l?.em_estudo!=="boolean"||typeof l?.revisao!=="boolean")return []; return [{id,slug:l.slug,titulo:l.titulo,ordem,recorteId:optionalUuid(l?.recorte_id),emEstudo:l.em_estudo,revisao:l.revisao,campaignStatus:"nao_iniciada" as const,progress:{correct:0,errors:0,unanswered:0}}];}); return [{id:String(e.id),tipo,nome:e.nome.trim(),leis:parsed}]; });
}
