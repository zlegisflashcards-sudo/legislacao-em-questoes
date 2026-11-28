import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { IncomingWhatsAppMessage, IncomingWhatsAppStatus, SalesReply, SalesTurn, WhatsAppRecipient } from "./types";
import type { SalesMode } from "./config";

export type SalesConversation = {
  id: string; phone_number_id: string; recipient_kind: WhatsAppRecipient["kind"]; recipient_value: string;
  display_name: string | null; phone_alias: string | null; status: "bot" | "human" | "opted_out"; paused_by_admin: boolean;
  stage: string; last_inbound_at: string; updated_at: string;
};
export type SalesJob = {
  id: string; conversation_id: string; phone_number_id: string; inbound_text: string; input_kind: "text" | "unsupported";
  received_at: string; mode: "shadow" | "live"; control_action: "human" | "opt_out" | null;
  claim_token: string; state: string; reply_text: string | null; created_at: string; attempts: number;
};

function assertResult(error: unknown) { if (error) throw new Error("legisdot_storage_unavailable"); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validSalesId = (id: string) => uuid.test(id);

export async function ingestSalesMessage(message: IncomingWhatsAppMessage, mode: Exclude<SalesMode, "disabled">, control: "human" | "opt_out" | null) {
  const { data, error } = await getSupabaseServerClient().rpc("legisdot_receive_message", {
    p_phone_number_id: message.phoneNumberId, p_provider_message_id: message.messageId,
    p_recipient_kind: message.recipient.kind, p_recipient_value: message.recipient.kind === "phone" ? message.recipient.value.replace(/^\+/, "") : message.recipient.value,
    p_display_name: message.displayName, p_received_at: message.timestamp,
    p_kind: message.kind, p_text: message.text.slice(0, 8000), p_mode: mode, p_control: control,
    p_phone_alias: message.phoneAlias?.replace(/^\+/, "") ?? null,
  });
  assertResult(error); return data === true;
}

export async function ingestSalesStatus(status: IncomingWhatsAppStatus, phoneNumberId: string) {
  const { error } = await getSupabaseServerClient().rpc("legisdot_record_status", {
    p_phone_number_id: phoneNumberId, p_message_id: status.messageId,
    p_correlation: status.correlationId && validSalesId(status.correlationId) ? status.correlationId : null,
    p_status: status.status, p_at: status.timestamp,
  });
  assertResult(error);
}

export async function claimSalesJob(phoneNumberId: string): Promise<SalesJob | null> {
  const { data, error } = await getSupabaseServerClient().rpc("legisdot_claim_message", { p_phone_number_id: phoneNumberId });
  assertResult(error); return data?.[0] ?? null;
}

export async function getSalesConversation(id: string): Promise<SalesConversation | null> {
  const { data, error } = await getSupabaseServerClient().from("legisdot_conversations")
    .select("id,phone_number_id,recipient_kind,recipient_value,display_name,phone_alias,status,paused_by_admin,stage,last_inbound_at,updated_at")
    .eq("id", id).maybeSingle();
  assertResult(error); return data as SalesConversation | null;
}

export async function salesHistory(job: SalesJob): Promise<SalesTurn[]> {
  const { data, error } = await getSupabaseServerClient().from("legisdot_messages")
    .select("id,inbound_text,reply_text,state,created_at").eq("conversation_id", job.conversation_id)
    .lt("created_at", job.created_at).order("created_at", { ascending: false }).limit(8);
  assertResult(error);
  return (data ?? []).reverse().flatMap((row): SalesTurn[] => [
    { role: "user", content: row.inbound_text.slice(0, 2000) },
    // Rascunhos nunca entregues não são tratados como falas já vistas pelo cliente.
    ...(row.reply_text && row.state === "accepted" ? [{ role: "assistant" as const, content: row.reply_text.slice(0, 4096) }] : []),
  ]);
}

export async function saveSalesReply(job: SalesJob, reply: SalesReply) {
  const { data, error } = await getSupabaseServerClient().rpc("legisdot_save_reply", {
    p_id: job.id, p_token: job.claim_token, p_text: reply.text, p_stage: reply.stage,
    p_engine: reply.engine, p_products: reply.productIds, p_handoff: reply.handoff, p_opt_out: reply.optOut,
  });
  assertResult(error); return data === true;
}

export async function updateSalesJob(job: SalesJob, state: string, code: string | null, allowedStates = ["processing", "ready"]) {
  const { error } = await getSupabaseServerClient().from("legisdot_messages")
    .update({ state, error_code: code, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("claim_token", job.claim_token).in("state", allowedStates);
  assertResult(error);
}

export async function retrySalesJob(job: SalesJob) {
  const retry = job.attempts < 3;
  const { error } = await getSupabaseServerClient().from("legisdot_messages").update({
    state: retry ? "pending" : "failed", error_code: "processing_error", lease_until: null,
    retry_after: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("claim_token", job.claim_token).in("state", ["processing", "ready"]);
  assertResult(error); return retry;
}

export async function prepareSalesSend(job: SalesJob, dailyLimit: number): Promise<string> {
  const { data, error } = await getSupabaseServerClient().rpc("legisdot_prepare_send", {
    p_id: job.id, p_token: job.claim_token, p_daily_limit: dailyLimit,
  });
  assertResult(error); return String(data);
}

export async function acceptSalesSend(job: SalesJob, messageId: string) {
  const { error } = await getSupabaseServerClient().from("legisdot_messages")
    .update({ state: "accepted", outbound_message_id: messageId, error_code: null, updated_at: new Date().toISOString() })
    .eq("id", job.id).eq("claim_token", job.claim_token).eq("state", "sending");
  assertResult(error);
}

export async function listSalesConversations() {
  const { data, error } = await getSupabaseServerClient().from("legisdot_conversations")
    .select("id,display_name,recipient_kind,recipient_value,phone_alias,status,stage,last_inbound_at,updated_at")
    .order("updated_at", { ascending: false }).limit(100);
  assertResult(error);
  return (data ?? []).map((row) => ({
    id: row.id, displayName: row.display_name,
    senderLabel: row.phone_alias || row.recipient_kind === "phone" ? `•••• ${String(row.phone_alias || row.recipient_value).slice(-4)}` : "Cliente WhatsApp",
    status: row.status, stage: row.stage, lastInboundAt: row.last_inbound_at, updatedAt: row.updated_at,
  }));
}

export async function listSalesMessages(conversationId: string) {
  const { data, error } = await getSupabaseServerClient().from("legisdot_messages")
    .select("id,inbound_text,reply_text,state,created_at,delivery_status").eq("conversation_id", conversationId)
    .order("created_at", { ascending: false }).limit(100);
  assertResult(error);
  return (data ?? []).reverse().map((row) => ({ id: row.id, inboundText: row.inbound_text,
    replyText: row.reply_text, state: row.state, createdAt: row.created_at, deliveryStatus: row.delivery_status }));
}

export async function changeSalesConversation(id: string, action: "pause" | "resume") {
  const { data, error } = await getSupabaseServerClient().from("legisdot_conversations")
    .update({ status: action === "pause" ? "human" : "bot", paused_by_admin: action === "pause", updated_at: new Date().toISOString() })
    .eq("id", id).neq("status", "opted_out").select("id").maybeSingle();
  assertResult(error); return Boolean(data);
}
