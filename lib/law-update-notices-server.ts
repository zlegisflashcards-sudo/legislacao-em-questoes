import "server-only";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const db = () => getSupabaseServerClient();
async function recipientCount(lawId:number) { const r=await db().rpc("obter_destinatarios_aviso_lei",{p_lei_id:lawId}); if(r.error) throw new Error(r.error.message); return new Set((r.data??[]).map((x:{aluno_id:string})=>x.aluno_id)).size; }
export type NoticeKind = "question_added" | "question_changed" | "question_removed" | "structure_changed" | "law_content_changed";
export async function recordLawUpdate(lawId: number, kind: NoticeKind, summary: string, metadata: Record<string, unknown> = {}) {
  const { error } = await db().rpc("record_law_update_notice_event", { p_law_id: lawId, p_kind: kind, p_summary: summary, p_metadata: metadata });
  if (error) throw new Error("Não foi possível registrar o aviso de atualização: " + error.message);
}
async function admin() { if (!await obterAdministrador()) throw new Error("Administração obrigatória."); }
export async function listNotices() { await admin(); const r=await db().from("law_update_notices").select("*,leis(titulo,slug),law_update_notice_changes(*) ").order("created_at",{ascending:false}); if(r.error) throw new Error(r.error.message); const rows=r.data??[]; const publishedIds=rows.filter(row=>row.status!=="draft").map(row=>row.id); const deliveries=publishedIds.length?await db().from("law_update_notice_deliveries").select("notice_id").in("notice_id",publishedIds):null; if(deliveries?.error) throw new Error(deliveries.error.message); return Promise.all(rows.map(async row=>({...row,recipient_count:row.status==="draft"?await recipientCount(row.law_id):(deliveries?.data?.filter(delivery=>delivery.notice_id===row.id).length??0)}))); }
export async function notice(id:string) { await admin(); const r=await db().from("law_update_notices").select("*,leis(titulo,slug),law_update_notice_changes(*)").eq("id",id).single(); if(r.error) throw new Error("Aviso não encontrado."); const recipient_count=r.data.status==="draft"?await recipientCount(r.data.law_id):(await db().from("law_update_notice_deliveries").select("notice_id",{count:"exact",head:true}).eq("notice_id",id)).count??0; return {...r.data,recipient_count}; }
export async function updateNotice(id:string,data:{title?:string;message?:string;destination_url?:string|null}) { await admin(); const {title,message,destination_url}=data; const r=await db().from("law_update_notices").update({...(title!==undefined?{title}:{}),...(message!==undefined?{message}:{}),...(destination_url!==undefined?{destination_url}:{})}).eq("id",id).eq("status","draft"); if(r.error) throw new Error(r.error.message); }
export async function publishNotice(id:string) { await admin(); const r=await db().rpc("publish_law_update_notice",{p_notice_id:id}); if(r.error) throw new Error(r.error.message); return r.data as number; }
export async function discardNotice(id:string) { await admin(); const r=await db().from("law_update_notices").update({status:"discarded",discarded_at:new Date().toISOString()}).eq("id",id).eq("status","draft"); if(r.error) throw new Error(r.error.message); }
export async function noticeRecipients(id:string) { await admin(); const n=await db().from("law_update_notice_deliveries").select("student_id").eq("notice_id",id); const ids=(n.data??[]).map(x=>x.student_id); if(!ids.length)return []; const s=await db().from("alunos").select("id,nome,email").in("id",ids); return s.data??[]; }
export async function claimResend(id:string) { await admin(); const r=await db().rpc("claim_law_update_notice_resend",{p_notice_id:id}); if(r.error) throw new Error(r.error.message); return r.data===true; }
export async function finishResend(id:string,success:boolean,count:number,error?:string) { const r=await db().rpc("finish_law_update_notice_resend",{p_notice_id:id,p_success:success,p_count:count,p_error:error??null}); if(r.error) throw new Error(r.error.message); }
