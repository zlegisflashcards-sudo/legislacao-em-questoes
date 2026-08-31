export type StudentExamLaw = { id: number; slug: string; titulo: string; ordem: number; recorteId: string | null; recorteNome?: string | null; emEstudo: boolean; revisao: boolean; campaignStatus: "nao_iniciada" | "em_andamento" | "concluida" };
export type StudentExam = { id: string; tipo: "personalizado" | "produto"; nome: string; leis: StudentExamLaw[] };
export function nextExamLawProgress(law: Pick<StudentExamLaw, "emEstudo" | "revisao">, control: "study" | "review") { if (control === "study" && law.revisao) return null; return control === "review" ? { inStudy: true, questionsFinished: !law.revisao } : { inStudy: !law.emEstudo, questionsFinished: false }; }

function record(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function optionalUuid(value: unknown) { return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null; }
export function parseStudentExams(value: unknown): StudentExam[] {
  const root = record(value); const rows = root?.editais;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((item) => { const e=record(item); const tipo=e?.tipo; const leis=e?.leis; if ((tipo!=="personalizado"&&tipo!=="produto") || typeof e?.id!=="string" && typeof e?.id!=="number" || typeof e?.nome!=="string" || !e.nome.trim() || !Array.isArray(leis)) return []; const parsed=leis.flatMap((law)=>{const l=record(law); const id=typeof l?.id==="number"?l.id:NaN; const ordem=typeof l?.ordem==="number"?l.ordem:NaN; if(!Number.isSafeInteger(id)||id<1||typeof l?.slug!=="string"||!l.slug||typeof l?.titulo!=="string"||!l.titulo||!Number.isSafeInteger(ordem)||typeof l?.em_estudo!=="boolean"||typeof l?.revisao!=="boolean")return []; return [{id,slug:l.slug,titulo:l.titulo,ordem,recorteId:optionalUuid(l?.recorte_id),emEstudo:l.em_estudo,revisao:l.revisao,campaignStatus:"nao_iniciada" as const}];}); return [{id:String(e.id),tipo,nome:e.nome.trim(),leis:parsed}]; });
}
