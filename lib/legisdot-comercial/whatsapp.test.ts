import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isServiceWindowOpen,
  parseWhatsAppEnvelope,
  sendWhatsAppText,
  verifyWhatsAppSignature,
  WhatsAppSendError,
} from "./whatsapp";

const now = new Date("2026-11-24T15:00:00.000Z");
const phoneNumberId = "123456789012345";
const phone = "5511987654321";
const bsuid = "BR.abc123";
const timestamp = String(now.getTime() / 1_000 - 5);

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "wamid.inbound",
    timestamp,
    from: phone,
    from_user_id: bsuid,
    type: "text",
    text: { body: "Quero estudar a Constituição." },
    ...overrides,
  };
}

function change(overrides: Record<string, unknown> = {}) {
  return {
    field: "messages",
    value: {
      messaging_product: "whatsapp",
      metadata: { phone_number_id: phoneNumberId },
      contacts: [{ wa_id: phone, user_id: bsuid, profile: { name: "Ana" } }],
      messages: [message()],
      ...overrides,
    },
  };
}

function envelope(changes: unknown[] = [change()]) {
  return { object: "whatsapp_business_account", entry: [{ changes }] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("WhatsApp webhook authenticity", () => {
  it("validates the exact raw bytes and rejects re-serialized or tampered content", () => {
    const raw = Buffer.from('{ "text": "Constituição ⚡" }\n');
    const secret = "meta-app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyWhatsAppSignature(raw, signature, secret)).toBe(true);
    expect(verifyWhatsAppSignature(Buffer.from(JSON.stringify(JSON.parse(raw.toString()))), signature, secret)).toBe(false);
    expect(verifyWhatsAppSignature(raw, signature, "another-secret")).toBe(false);
  });

  it.each([null, "", "sha256=abc", `sha256=${"z".repeat(64)}`, `sha1=${"a".repeat(64)}`])(
    "rejects missing or malformed signatures without throwing: %s",
    (signature) => {
      expect(verifyWhatsAppSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
    },
  );

  it("fails closed when the app secret is not configured", () => {
    const raw = Buffer.from("{}");
    const signature = `sha256=${createHmac("sha256", "").update(raw).digest("hex")}`;
    expect(verifyWhatsAppSignature(raw, signature, "")).toBe(false);
  });
});

describe("WhatsApp envelope parsing", () => {
  it("prefers BSUID and retains the original Meta timestamp and matching name", () => {
    const parsed = parseWhatsAppEnvelope(envelope(), phoneNumberId, now);
    expect(parsed.messages).toEqual([{
      messageId: "wamid.inbound",
      phoneNumberId,
      recipient: { kind: "bsuid", value: bsuid },
      phoneAlias: phone,
      displayName: "Ana",
      timestamp: "2026-11-24T14:59:55.000Z",
      kind: "text",
      text: "Quero estudar a Constituição.",
    }]);
  });

  it("supports a BSUID-only customer without a phone number", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [message({ from: undefined })] })]), phoneNumberId, now);
    expect(parsed.messages[0].recipient).toEqual({ kind: "bsuid", value: bsuid });
    expect(parsed.messages[0].phoneAlias).toBeUndefined();
  });

  it("does not retain an invalid phone alias when the BSUID is valid", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [message({ from: "not-a-phone" })] })]), phoneNumberId, now);
    expect(parsed.messages[0].recipient).toEqual({ kind: "bsuid", value: bsuid });
    expect(parsed.messages[0].phoneAlias).toBeUndefined();
  });

  it("falls back to phone for legacy payloads and never borrows another customer's name", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({
      contacts: [{ wa_id: "5511999999999", user_id: "BR.other", profile: { name: "Outro cliente" } }],
      messages: [message({ from_user_id: undefined })],
    })]), phoneNumberId, now);
    expect(parsed.messages[0].recipient).toEqual({ kind: "phone", value: phone });
    expect(parsed.messages[0].phoneAlias).toBe(phone);
    expect(parsed.messages[0].displayName).toBeNull();
  });

  it("uses the matching contact's BSUID when a legacy message only identifies its phone", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [message({ from_user_id: undefined })] })]), phoneNumberId, now);
    expect(parsed.messages[0].recipient).toEqual({ kind: "bsuid", value: bsuid });
  });

  it("walks every entry, change and message; excludes other numbers and fields", () => {
    const payload = envelope([
      change({ messages: [message({ id: "wamid.first" }), null, message({ id: "wamid.second" })] }),
      change({ metadata: { phone_number_id: "999" }, messages: [message({ id: "wamid.foreign" })] }),
      { ...change(), field: "smb_message_echoes" },
      null,
    ]);
    payload.entry.push({ changes: [change({ messages: [message({ id: "wamid.third" })] })] });
    expect(parseWhatsAppEnvelope(payload, phoneNumberId, now).messages.map((item) => item.messageId)).toEqual([
      "wamid.first", "wamid.second", "wamid.third",
    ]);
  });

  it.each([null, [], {}, { object: "page", entry: [] }, { object: "whatsapp_business_account", entry: {} }])(
    "ignores an invalid envelope: %j",
    (payload) => {
      expect(parseWhatsAppEnvelope(payload, phoneNumberId, now)).toEqual({ messages: [], statuses: [] });
    },
  );

  it("ignores invalid per-item structures without losing valid neighbors", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({
      messages: [
        message({ id: null }), message({ from: undefined, from_user_id: undefined }),
        message({ text: { body: {} } }), message(),
      ],
    }), change({ messaging_product: "messenger" })]), phoneNumberId, now);
    expect(parsed.messages).toHaveLength(1);
  });

  it("rejects invalid timestamps and accepts only 60 seconds of future clock skew", () => {
    const invalid = ["0", "-1", "1.5", "bad", 123, "99999999999999999999", String(now.getTime() / 1_000 + 61)];
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [
      ...invalid.map((value, index) => message({ id: `wamid.bad${index}`, timestamp: value })),
      message({ id: "wamid.tolerance", timestamp: String(now.getTime() / 1_000 + 60) }),
      message({ id: "wamid.old", timestamp: String(now.getTime() / 1_000 - 86_401) }),
    ] })]), phoneNumberId, now);
    expect(parsed.messages.map((item) => item.messageId)).toEqual(["wamid.tolerance", "wamid.old"]);
    expect(parsed.messages[0].timestamp).toBe("2026-11-24T15:01:00.000Z");
    expect(isServiceWindowOpen(parsed.messages[1].timestamp, now)).toBe(false);
  });

  it("extracts the label of buttons, list replies and template buttons as text", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [
      message({ id: "wamid.button", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "buy", title: "Comprar" } } }),
      message({ id: "wamid.list", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "cf", title: "Constituição Federal" } } }),
      message({ id: "wamid.template", type: "button", button: { payload: "handoff", text: "Falar com atendente" } }),
    ] })]), phoneNumberId, now);
    expect(parsed.messages.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "text", text: "Comprar" },
      { kind: "text", text: "Constituição Federal" },
      { kind: "text", text: "Falar com atendente" },
    ]);
  });

  it("marks media as unsupported and ignores system/edit/revoke events", () => {
    const parsed = parseWhatsAppEnvelope(envelope([change({ messages: [
      message({ type: "audio", audio: { id: "media-1" } }),
      message({ type: "image" }),
      message({ type: "system" }), message({ type: "edit" }), message({ type: "revoke" }),
    ] })]), phoneNumberId, now);
    expect(parsed.messages.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "unsupported", text: "[Mensagem de áudio recebida]" },
      { kind: "unsupported", text: "[Imagem recebida]" },
    ]);
  });

  it("parses statuses for the configured number without inventing an inbound message", () => {
    const status = { id: "wamid.outbound", timestamp, status: "failed", biz_opaque_callback_data: "outbox-1" };
    const parsed = parseWhatsAppEnvelope(envelope([
      change({ messages: [], contacts: undefined, statuses: [status, { ...status, status: "played" }] }),
      change({ metadata: { phone_number_id: "999" }, messages: [], statuses: [status] }),
    ]), phoneNumberId, now);
    expect(parsed).toEqual({ messages: [], statuses: [{
      messageId: "wamid.outbound", correlationId: "outbox-1", status: "failed", timestamp: "2026-11-24T14:59:55.000Z",
    }] });
  });
});

describe("WhatsApp customer service window", () => {
  it("closes one minute before the 24-hour limit", () => {
    const age = (milliseconds: number) => new Date(now.getTime() - milliseconds).toISOString();
    expect(isServiceWindowOpen(age(24 * 60 * 60 * 1_000 - 60_001), now)).toBe(true);
    expect(isServiceWindowOpen(age(24 * 60 * 60 * 1_000 - 60_000), now)).toBe(false);
    expect(isServiceWindowOpen(age(24 * 60 * 60 * 1_000), now)).toBe(false);
  });

  it("fails closed for invalid or excessive future timestamps", () => {
    expect(isServiceWindowOpen("invalid", now)).toBe(false);
    expect(isServiceWindowOpen("1970-01-01T00:00:00.000Z", now)).toBe(false);
    expect(isServiceWindowOpen(new Date(now.getTime() + 60_001).toISOString(), now)).toBe(false);
    expect(isServiceWindowOpen(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(true);
    expect(isServiceWindowOpen(now.toISOString(), new Date("invalid"))).toBe(false);
  });
});

const sendInput = {
  phoneNumberId,
  accessToken: "test-access-token",
  graphVersion: "v27.0",
  recipient: { kind: "phone" as const, value: phone },
  text: "Conheça os materiais.",
  correlationId: "00000000-0000-4000-8000-000000000001",
};

function stubFetch(response: Response) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("WhatsApp text sending (mocked HTTP only)", () => {
  it("uses the fixed Graph host, Bearer token, callback ID and a valid text payload", async () => {
    const fetcher = stubFetch(Response.json({ messages: [{ id: "wamid.outbound" }] }));
    await expect(sendWhatsAppText(sendInput)).resolves.toEqual({ messageId: "wamid.outbound" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v27.0/${phoneNumberId}/messages`);
    expect(init).toMatchObject({
      method: "POST", redirect: "error", cache: "no-store",
      headers: { Authorization: "Bearer test-access-token", "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text",
      text: { body: sendInput.text, preview_url: false }, biz_opaque_callback_data: sendInput.correlationId,
    });
  });

  it("uses recipient, without to, for BSUID-only customers", async () => {
    const fetcher = stubFetch(Response.json({ messages: [{ id: "wamid.bsuid" }] }));
    await sendWhatsAppText({ ...sendInput, recipient: { kind: "bsuid", value: bsuid } });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.recipient).toBe(bsuid);
    expect(body).not.toHaveProperty("to");
  });

  it.each([
    { phoneNumberId: "123/../../456" }, { graphVersion: "v27.0/elsewhere" },
    { accessToken: "" }, { accessToken: "token\r\nOther: header" },
    { text: " " }, { text: "a".repeat(4_097) }, { correlationId: "" },
    { recipient: { kind: "phone" as const, value: "https://attacker.example" } },
    { recipient: { kind: "bsuid" as const, value: "BR.abc/123" } },
  ])("rejects invalid local input before making any HTTP request: %j", async (overrides) => {
    const fetcher = stubFetch(Response.json({ messages: [{ id: "wamid.unused" }] }));
    await expect(sendWhatsAppText({ ...sendInput, ...overrides })).rejects.toMatchObject({
      name: "WhatsAppSendError", code: "invalid_input", ambiguous: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts the 4096-character boundary", async () => {
    stubFetch(Response.json({ messages: [{ id: "wamid.limit" }] }));
    await expect(sendWhatsAppText({ ...sendInput, text: "a".repeat(4_096) })).resolves.toEqual({ messageId: "wamid.limit" });
  });

  it("treats an explicit 4xx rejection as definitive and does not expose response text or retry", async () => {
    const fetcher = stubFetch(Response.json({ error: { code: 131047, message: "Sensitive provider message" } }, { status: 400 }));
    const error = await sendWhatsAppText(sendInput).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(WhatsAppSendError);
    expect(error).toMatchObject({ code: "meta_131047", ambiguous: false });
    expect(String(error)).not.toContain("Sensitive provider message");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps a non-JSON 4xx response definitive", async () => {
    stubFetch(new Response("Bad request", { status: 400 }));
    await expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "http_400", ambiguous: false });
  });

  it("marks a 5xx response ambiguous and does not retry", async () => {
    const fetcher = stubFetch(new Response("Unavailable", { status: 503 }));
    await expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "http_503", ambiguous: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { messages: [] }, { messages: [{ id: 1 }] }, { messages: [{ id: "invalid id" }] }])(
    "marks malformed success as ambiguous: %j",
    async (payload) => {
      stubFetch(Response.json(payload));
      await expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "malformed_success", ambiguous: true });
    },
  );

  it("marks a successful response with non-JSON body ambiguous", async () => {
    stubFetch(new Response("Not JSON", { status: 200 }));
    await expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "malformed_success", ambiguous: true });
  });

  it("marks network failures ambiguous and does not retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network failed"));
    vi.stubGlobal("fetch", fetcher);
    await expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "network_error", ambiguous: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts after 10 seconds and marks the send ambiguous without retrying", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const assertion = expect(sendWhatsAppText(sendInput)).rejects.toMatchObject({ code: "timeout", ambiguous: true });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
