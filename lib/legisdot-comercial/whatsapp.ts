import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  IncomingWhatsAppMessage,
  IncomingWhatsAppStatus,
  WhatsAppEnvelope,
  WhatsAppRecipient,
} from "./types";

// Meta: /documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
// and /business-scoped-user-ids. Verify the raw bytes before parsing the envelope.
const CLOCK_TOLERANCE_MS = 60_000;
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const SEND_TIMEOUT_MS = 10_000;
const PHONE_NUMBER_ID_PATTERN = /^\d{1,32}$/;
const PHONE_PATTERN = /^\+?[1-9]\d{5,14}$/;
const BSUID_PATTERN = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;
const GRAPH_VERSION_PATTERN = /^v[1-9]\d{0,2}\.\d{1,2}$/;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function nonemptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function validPhone(value: unknown): string | null {
  return typeof value === "string" && PHONE_PATTERN.test(value) ? value : null;
}

function validBsuid(value: unknown): string | null {
  return typeof value === "string" && BSUID_PATTERN.test(value) ? value : null;
}

function metaTimestamp(value: unknown, nowMs: number): string | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  const timestampMs = seconds * 1_000;
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    !Number.isSafeInteger(timestampMs) ||
    timestampMs > nowMs + CLOCK_TOLERANCE_MS
  ) {
    return null;
  }
  return new Date(timestampMs).toISOString();
}

export function verifyWhatsAppSignature(
  raw: Buffer,
  signature: string | null,
  appSecret: string,
): boolean {
  if (!appSecret || !signature) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature);
  if (!match) return false;
  const provided = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(raw).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function contactForMessage(message: JsonRecord, contacts: unknown[]): JsonRecord | null {
  const bsuid = validBsuid(message.from_user_id);
  const phone = validPhone(message.from)?.replace(/^\+/, "");
  for (const candidate of contacts) {
    const contact = record(candidate);
    if (!contact) continue;
    if (bsuid && contact.user_id === bsuid) return contact;
    if (!bsuid && phone && validPhone(contact.wa_id)?.replace(/^\+/, "") === phone) {
      return contact;
    }
  }
  return null;
}

function messageContent(message: JsonRecord): Pick<IncomingWhatsAppMessage, "kind" | "text"> | null {
  if (message.type === "text") {
    const text = nonemptyString(record(message.text)?.body);
    return text ? { kind: "text", text } : null;
  }

  if (message.type === "button") {
    const text = nonemptyString(record(message.button)?.text);
    return text ? { kind: "text", text } : null;
  }

  if (message.type === "interactive") {
    const interactive = record(message.interactive);
    if (interactive?.type === "button_reply" || interactive?.type === "list_reply") {
      const reply = record(interactive[interactive.type]);
      const text = nonemptyString(reply?.title);
      return text ? { kind: "text", text } : null;
    }
  }

  // Account and message maintenance events must not start a new customer turn.
  if (message.type === "system" || message.type === "edit" || message.type === "revoke") {
    return null;
  }

  const descriptions: Record<string, string> = {
    audio: "[Mensagem de áudio recebida]",
    image: "[Imagem recebida]",
    document: "[Documento recebido]",
    video: "[Vídeo recebido]",
    sticker: "[Figurinha recebida]",
    location: "[Localização recebida]",
    contacts: "[Contato recebido]",
    reaction: "[Reação recebida]",
  };
  return {
    kind: "unsupported",
    text: typeof message.type === "string" && Object.hasOwn(descriptions, message.type)
      ? descriptions[message.type]
      : "[Mensagem de tipo não suportado recebida]",
  };
}

function parseMessage(
  value: unknown,
  phoneNumberId: string,
  contacts: unknown[],
  nowMs: number,
): IncomingWhatsAppMessage | null {
  const message = record(value);
  if (!message || typeof message.type !== "string") return null;
  const messageId = nonemptyString(message.id);
  const timestamp = metaTimestamp(message.timestamp, nowMs);
  if (!messageId || !timestamp) return null;

  const contact = contactForMessage(message, contacts);
  const bsuid = validBsuid(message.from_user_id) ?? validBsuid(contact?.user_id);
  const phone = validPhone(message.from);
  const recipient: WhatsAppRecipient | null = bsuid
    ? { kind: "bsuid", value: bsuid }
    : phone ? { kind: "phone", value: phone } : null;
  if (!recipient) return null;

  const content = messageContent(message);
  if (!content) return null;
  return {
    messageId,
    phoneNumberId,
    recipient,
    ...(phone ? { phoneAlias: phone } : {}),
    displayName: nonemptyString(record(contact?.profile)?.name),
    timestamp,
    ...content,
  };
}

function parseStatus(value: unknown, nowMs: number): IncomingWhatsAppStatus | null {
  const status = record(value);
  if (!status) return null;
  const messageId = nonemptyString(status.id);
  const timestamp = metaTimestamp(status.timestamp, nowMs);
  if (!messageId || !timestamp) return null;
  if (
    status.status !== "sent" && status.status !== "delivered" &&
    status.status !== "read" && status.status !== "failed"
  ) {
    return null;
  }
  return {
    messageId,
    correlationId: nonemptyString(status.biz_opaque_callback_data),
    status: status.status,
    timestamp,
  };
}

export function parseWhatsAppEnvelope(
  payload: unknown,
  phoneNumberId: string,
  now: Date = new Date(),
): WhatsAppEnvelope {
  const envelope: WhatsAppEnvelope = { messages: [], statuses: [] };
  const root = record(payload);
  const nowMs = now.getTime();
  if (
    root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry) ||
    typeof phoneNumberId !== "string" || !PHONE_NUMBER_ID_PATTERN.test(phoneNumberId) ||
    !Number.isFinite(nowMs)
  ) {
    return envelope;
  }

  for (const entryValue of root.entry) {
    const entry = record(entryValue);
    if (!Array.isArray(entry?.changes)) continue;
    for (const changeValue of entry.changes) {
      const change = record(changeValue);
      const value = record(change?.value);
      if (
        change?.field !== "messages" || value?.messaging_product !== "whatsapp" ||
        record(value.metadata)?.phone_number_id !== phoneNumberId
      ) {
        continue;
      }
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const candidate of Array.isArray(value.messages) ? value.messages : []) {
        const message = parseMessage(candidate, phoneNumberId, contacts, nowMs);
        if (message) envelope.messages.push(message);
      }
      for (const candidate of Array.isArray(value.statuses) ? value.statuses : []) {
        const status = parseStatus(candidate, nowMs);
        if (status) envelope.statuses.push(status);
      }
    }
  }
  return envelope;
}

export function isServiceWindowOpen(lastInboundAt: string, now: Date = new Date()): boolean {
  const lastInboundMs = Date.parse(lastInboundAt);
  const nowMs = now.getTime();
  return Number.isFinite(lastInboundMs) && Number.isFinite(nowMs) && lastInboundMs > 0 &&
    lastInboundMs <= nowMs + CLOCK_TOLERANCE_MS &&
    nowMs < lastInboundMs + SERVICE_WINDOW_MS - CLOCK_TOLERANCE_MS;
}

export class WhatsAppSendError extends Error {
  readonly code: string;
  readonly ambiguous: boolean;

  constructor(message: string, code: string, ambiguous: boolean) {
    super(message);
    this.name = "WhatsAppSendError";
    this.code = code;
    this.ambiguous = ambiguous;
  }
}

type SendWhatsAppTextInput = {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  recipient: WhatsAppRecipient;
  text: string;
  correlationId: string;
};

function validSendInput(input: SendWhatsAppTextInput): boolean {
  return Boolean(
    input && typeof input.phoneNumberId === "string" && PHONE_NUMBER_ID_PATTERN.test(input.phoneNumberId) &&
    typeof input.graphVersion === "string" && GRAPH_VERSION_PATTERN.test(input.graphVersion) &&
    typeof input.accessToken === "string" && input.accessToken.trim().length > 0 &&
    !/[\r\n]/.test(input.accessToken) &&
    typeof input.text === "string" && input.text.trim().length > 0 && input.text.length <= 4_096 &&
    typeof input.correlationId === "string" && input.correlationId.trim().length > 0 &&
    input.correlationId.length <= 512 &&
    !Array.from(input.correlationId).some((character) => character.charCodeAt(0) < 32) &&
    ((input.recipient?.kind === "phone" && validPhone(input.recipient.value)) ||
      (input.recipient?.kind === "bsuid" && validBsuid(input.recipient.value))),
  );
}

function graphErrorCode(payload: unknown, status: number): string {
  const code = record(record(payload)?.error)?.code;
  return typeof code === "number" && Number.isSafeInteger(code)
    ? `meta_${code}`
    : `http_${status}`;
}

// Meta: /messages/text-messages and /webhooks/reference/messages/status.
// A POST timeout can follow an accepted send: do not retry here. The caller
// reconciles its durable outbox using biz_opaque_callback_data in status events.
export async function sendWhatsAppText(input: SendWhatsAppTextInput): Promise<{ messageId: string }> {
  if (!validSendInput(input)) {
    throw new WhatsAppSendError("Parâmetros inválidos para envio ao WhatsApp.", "invalid_input", false);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${input.graphVersion}/${input.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...(input.recipient.kind === "bsuid"
            ? { recipient: input.recipient.value }
            : { to: input.recipient.value }),
          type: "text",
          text: { body: input.text, preview_url: false },
          biz_opaque_callback_data: input.correlationId,
        }),
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      },
    );

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // An explicit HTTP error remains usable even when its body is not JSON.
    }
    if (!response.ok) {
      throw new WhatsAppSendError(
        "O WhatsApp não confirmou o envio da mensagem.",
        graphErrorCode(payload, response.status),
        response.status < 400 || response.status >= 500,
      );
    }

    const messages = record(payload)?.messages;
    const messageId = Array.isArray(messages) ? nonemptyString(record(messages[0])?.id) : null;
    if (!messageId || !messageId.startsWith("wamid.") || /\s/.test(messageId)) {
      throw new WhatsAppSendError(
        "O WhatsApp respondeu sem um identificador válido de mensagem.",
        "malformed_success",
        true,
      );
    }
    return { messageId };
  } catch (error) {
    if (error instanceof WhatsAppSendError) throw error;
    throw new WhatsAppSendError(
      "Não foi possível confirmar o resultado do envio ao WhatsApp.",
      controller.signal.aborted ? "timeout" : "network_error",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}
