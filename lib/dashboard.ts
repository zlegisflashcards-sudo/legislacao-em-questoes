export type DashboardExamStates = { revisao: number; emEstudo: number; restantes: number };
export type DashboardEdital = { id:string; tipo:"personalizado"|"produto"; nome:string; progresso:number|null; url:string; leis:number; estados: DashboardExamStates };
export type DashboardData = { nomePublico:string|null; editalAtivo:DashboardEdital|null; editais:DashboardEdital[] };
export function percentage(completed:number,total:number){return total>0?Math.round((completed/total)*100):null;}
export function examStates(laws: Array<{ revisao: boolean; emEstudo: boolean }>): DashboardExamStates { const revisao=laws.filter((law)=>law.revisao).length; const emEstudo=laws.filter((law)=>!law.revisao&&law.emEstudo).length; return {revisao,emEstudo,restantes:laws.length-revisao-emEstudo}; }
export function normalizeProgress(value:unknown){return typeof value==="number"&&Number.isFinite(value)?Math.min(100,Math.max(0,Math.round(value))):null;}
export type DailyReviewState={dataRevisao:string|null;hojeConcluida:boolean;streakAtual:number};
export const EMPTY_REVIEW_STATE:DailyReviewState={dataRevisao:null,hojeConcluida:false,streakAtual:0};
export function parseDailyReviewRpc(value:unknown):DailyReviewState{const row=Array.isArray(value)?value[0]:value;if(!row||typeof row!=="object")return EMPTY_REVIEW_STATE;const r=row as Record<string,unknown>;return{dataRevisao:typeof r.data_revisao==="string"?r.data_revisao:null,hojeConcluida:r.hoje_concluida===true,streakAtual:typeof r.streak_atual==="number"?r.streak_atual:0};}
export function dailyGuidance(done:boolean){return done?"Revisão concluída. Agora você pode avançar no seu edital.":"Faça primeiro sua revisão diária antes de avançar para um novo conteúdo.";}
