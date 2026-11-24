import "server-only";
import { salesConfig, configurationStatus } from "./config";
import { loadSalesCatalog } from "./catalog";
import { createSalesReply } from "./reply";
import { isServiceWindowOpen, sendWhatsAppText, WhatsAppSendError } from "./whatsapp";
import * as store from "./store";
import type { SalesReply } from "./types";

/** Uma execução trabalha um item. O webhook agenda uma; um cron autenticado recupera pendências. */
export async function processNextSalesMessage(): Promise<{ processed: boolean; result: string }> {
  const config = salesConfig();
  if (config.mode === "disabled") return { processed: false, result: "disabled" };
  const job = await store.claimSalesJob(config.phoneNumberId);
  if (!job) return { processed: false, result: "empty" };
  try {
    const conversation = await store.getSalesConversation(job.conversation_id);
    if (!conversation || job.phone_number_id !== config.phoneNumberId) {
      await store.updateSalesJob(job, "ignored", "different_account");
      return { processed: true, result: "different_account" };
    }
    const controlledAck = (job.control_action === "opt_out" && conversation.status === "opted_out")
      || (job.control_action === "human" && conversation.status === "human");
    if (conversation.paused_by_admin || (conversation.status !== "bot" && !controlledAck)) {
      await store.updateSalesJob(job, "ignored", "human_or_opted_out");
      return { processed: true, result: "human_or_opted_out" };
    }
    if (!isServiceWindowOpen(conversation.last_inbound_at)) {
      await store.updateSalesJob(job, "ignored", "window_closed");
      return { processed: true, result: "window_closed" };
    }
    let reply: SalesReply;
    if (job.input_kind === "unsupported") {
      reply = { text: "Sou o LegisDot, assistente virtual do Legis Flashcards. Nesta versão, consigo conversar por texto. Vou deixar o atendimento com a equipe. Se puder, escreva também o que precisa.",
        stage: "humano", handoff: true, optOut: false, productIds: [], engine: "rules", reason: "unsupported_media" };
    } else {
      const [catalog, history] = await Promise.all([loadSalesCatalog(), store.salesHistory(job)]);
      reply = await createSalesReply({ message: job.inbound_text, history, catalog, useAI: config.aiConfigured });
    }
    if (!await store.saveSalesReply(job, reply)) return { processed: true, result: "lease_lost" };
    if (job.mode === "shadow") return { processed: true, result: "draft" };
    const current = salesConfig();
    const allowed = current.allowAllRecipients || current.allowlist.includes(conversation.recipient_value)
      || Boolean(conversation.phone_alias && current.allowlist.includes(conversation.phone_alias));
    if (current.mode !== "live" || !configurationStatus().configured || !allowed) {
      await store.updateSalesJob(job, "draft", !allowed ? "recipient_restricted" : "sending_disabled", ["ready"]);
      return { processed: true, result: "draft" };
    }
    // O SQL revalida janela, pausa, opt-out, mensagem mais recente, lease e cotas atomicamente.
    const permission = await store.prepareSalesSend(job, current.dailyLimit);
    if (permission !== "send") return { processed: true, result: permission };
    try {
      const sent = await sendWhatsAppText({ phoneNumberId: current.phoneNumberId, accessToken: current.accessToken,
        graphVersion: current.graphVersion, recipient: { kind: conversation.recipient_kind, value: conversation.recipient_value },
        text: reply.text, correlationId: job.id });
      await store.acceptSalesSend(job, sent.messageId);
      return { processed: true, result: "accepted" };
    } catch (error) {
      const ambiguous = !(error instanceof WhatsAppSendError) || error.ambiguous;
      const code = error instanceof WhatsAppSendError ? error.code : "send_result_unknown";
      await store.updateSalesJob(job, ambiguous ? "uncertain" : "failed", code, ["sending"]);
      return { processed: true, result: ambiguous ? "uncertain" : "failed" };
    }
  } catch {
    // Nenhuma mensagem/credencial é escrita em logs. A entrega assinada pode reconciliar 'uncertain'.
    const retry = await store.retrySalesJob(job);
    return { processed: true, result: retry ? "retry_pending" : "failed" };
  }
}
