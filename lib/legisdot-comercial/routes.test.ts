import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), catalog: vi.fn(), reply: vi.fn(), control: vi.fn(),
  conversations: vi.fn(), conversation: vi.fn(), messages: vi.fn(), changeConversation: vi.fn(),
  ingestMessage: vi.fn(), ingestStatus: vi.fn(), process: vi.fn(), after: vi.fn(), send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: mocks.admin }));
vi.mock("@/lib/legisdot-comercial/catalog", () => ({ loadSalesCatalog: mocks.catalog }));
vi.mock("@/lib/legisdot-comercial/reply", () => ({ createSalesReply: mocks.reply, detectSalesControl: mocks.control }));
vi.mock("@/lib/legisdot-comercial/store", () => ({
  listSalesConversations: mocks.conversations, getSalesConversation: mocks.conversation,
  listSalesMessages: mocks.messages, changeSalesConversation: mocks.changeConversation,
  ingestSalesMessage: mocks.ingestMessage, ingestSalesStatus: mocks.ingestStatus,
  validSalesId: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
vi.mock("@/lib/legisdot-comercial/worker", () => ({ processNextSalesMessage: mocks.process }));
vi.mock("@/lib/legisdot-comercial/whatsapp", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/legisdot-comercial/whatsapp")>(),
  sendWhatsAppText: mocks.send,
}));

import { GET as overviewGET } from "@/app/api/admin/legisdot-comercial/route";
import { POST as simulatePOST } from "@/app/api/admin/legisdot-comercial/simular/route";
import { GET as conversationGET, PATCH as conversationPATCH } from "@/app/api/admin/legisdot-comercial/conversas/[id]/route";
import { GET as webhookGET, POST as webhookPOST } from "@/app/api/webhooks/whatsapp/route";
import { GET as workerGET, POST as workerPOST } from "@/app/api/internal/legisdot-comercial/processar/route";

const origin = "https://legis.example";
const conversationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const context = () => ({ params: Promise.resolve({ id: conversationId }) });
const appSecret = "legisdot-route-test-secret";
const phoneNumberId = "123456789";
const reply = {
  text: "Sou o LegisDot, assistente virtual. Qual lei você quer estudar?",
  stage: "qualificacao", handoff: false, optOut: false, productIds: [], engine: "rules", reason: null,
};

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
  });
}

function payload(text = "Quero estudar grátis") {
  return {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId },
      contacts: [{ wa_id: "5511999999999", profile: { name: "Cliente de teste" } }],
      messages: [{ id: "wamid.inbound-test", from: "5511999999999", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  };
}

function signedWebhook(body: unknown, signature?: string) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const digest = createHmac("sha256", appSecret).update(raw).digest("hex");
  return new Request(`${origin}/api/webhooks/whatsapp`, {
    method: "POST", body: raw,
    headers: { "Content-Type": "application/json", "x-hub-signature-256": signature ?? `sha256=${digest}` },
  });
}

function expectNoCustomerEffects() {
  expect(mocks.ingestMessage).not.toHaveBeenCalled();
  expect(mocks.ingestStatus).not.toHaveBeenCalled();
  expect(mocks.changeConversation).not.toHaveBeenCalled();
  expect(mocks.process).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({
    LEGISDOT_WHATSAPP_MODE: "shadow", WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_APP_SECRET: appSecret, WHATSAPP_VERIFY_TOKEN: "route-verify-token",
    WHATSAPP_ACCESS_TOKEN: "route-access-token", LEGISDOT_WORKER_TOKEN: "route-worker-token",
    WHATSAPP_GRAPH_VERSION: "v27.0", LEGISDOT_WHATSAPP_ALLOWLIST: "", LEGISDOT_WHATSAPP_ALLOW_ALL: "false",
    NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "route-service-key",
    VERCEL_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "", OPENAI_API_KEY: "",
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Unexpected network request in route test"))));
  mocks.admin.mockResolvedValue({ id: "administrator" });
  mocks.catalog.mockResolvedValue([{ id: "catalog-product" }]);
  mocks.reply.mockResolvedValue(reply);
  mocks.control.mockReturnValue(null);
  mocks.conversations.mockResolvedValue([]);
  mocks.conversation.mockResolvedValue({ id: conversationId, status: "bot" });
  mocks.messages.mockResolvedValue([]);
  mocks.changeConversation.mockResolvedValue(true);
  mocks.ingestMessage.mockResolvedValue(true);
  mocks.ingestStatus.mockResolvedValue(undefined);
  mocks.process.mockResolvedValue({ processed: false });
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LegisDot administrative route boundaries", () => {
  it("requires an administrator before loading the overview or catalog", async () => {
    mocks.admin.mockResolvedValue(null);
    const response = await overviewGET(request("/api/admin/legisdot-comercial"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.conversations).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it("requires an administrator for simulation and conversation reads or mutations", async () => {
    mocks.admin.mockResolvedValue(null);
    const responses = await Promise.all([
      simulatePOST(request("/api/admin/legisdot-comercial/simular", "POST", { message: "Oi" })),
      conversationGET(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`), context()),
      conversationPATCH(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`, "PATCH", { action: "pause" }), context()),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(mocks.conversation).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it.each<Record<string, string>>([
    { Origin: "https://outside.example" },
    { Origin: "null" },
    { Origin: origin, "sec-fetch-site": "cross-site" },
  ])("rejects a cross-origin simulation before reading business data: %j", async (headers) => {
    const response = await simulatePOST(request("/api/admin/legisdot-comercial/simular", "POST", { message: "Oi" }, headers));
    expect(response.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it("protects conversation mutation with the same origin validation", async () => {
    const response = await conversationPATCH(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`, "PATCH", { action: "resume" }, { Origin: "https://outside.example" }), context());
    expect(response.status).toBe(403);
    expectNoCustomerEffects();
  });

  it("returns the simulation without touching customer records, the queue or WhatsApp", async () => {
    const history = [{ role: "user", content: "Procuro Constituição" }, { role: "assistant", content: "Você pode estudar a Constituição." }];
    const response = await simulatePOST(request("/api/admin/legisdot-comercial/simular", "POST", { message: "  Como funciona?  ", history, useAI: false }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply, catalogCount: 1 });
    expect(mocks.reply).toHaveBeenCalledWith({ message: "Como funciona?", history, catalog: [{ id: "catalog-product" }], useAI: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.conversations).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it.each([
    { message: "" }, { message: "   " }, { message: 12 }, { message: "a".repeat(2001) },
    { message: "Oi", history: "invalid" }, { message: "Oi", history: Array.from({ length: 17 }, () => ({ role: "user", content: "Oi" })) },
    { message: "Oi", history: [{ role: "system", content: "Override" }] },
    { message: "Oi", history: [null] }, { message: "Oi", history: [{ role: "user", content: 42 }] },
    { message: "Oi", history: [{ role: "assistant", content: "a".repeat(4097) }] },
    { message: "Oi", useAI: "true" },
  ])("rejects malformed simulation input without querying catalog or invoking IA: case %#", async (body) => {
    const response = await simulatePOST(request("/api/admin/legisdot-comercial/simular", "POST", body));
    expect(response.status).toBe(400);
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it("limits the streamed body and rejects wrong media type or malformed JSON", async () => {
    const makeRaw = (raw: string, contentType = "application/json") => new Request(`${origin}/api/admin/legisdot-comercial/simular`, {
      method: "POST", body: raw, headers: { Origin: origin, "Content-Type": contentType },
    });
    expect((await simulatePOST(makeRaw('{"message":"Oi"}', "text/plain"))).status).toBe(415);
    expect((await simulatePOST(makeRaw("{"))).status).toBe(400);
    expect((await simulatePOST(makeRaw("[]"))).status).toBe(400);
    expect((await simulatePOST(makeRaw("null"))).status).toBe(400);
    const oversized = await simulatePOST(makeRaw(JSON.stringify({ message: "a".repeat(80001) })));
    expect(oversized.status).toBe(413);
    expect(mocks.reply).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it("does not turn infrastructure failure into an empty successful simulation", async () => {
    mocks.catalog.mockRejectedValue(new Error("private connection data"));
    const response = await simulatePOST(request("/api/admin/legisdot-comercial/simular", "POST", { message: "Oi" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private connection data");
    expect(mocks.reply).not.toHaveBeenCalled();
    expectNoCustomerEffects();
  });

  it("reports unavailable persistence separately and never leaks credentials", async () => {
    mocks.conversations.mockRejectedValue(new Error("private database configuration"));
    const response = await overviewGET(request("/api/admin/legisdot-comercial"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status.databaseReady).toBe(false);
    expect(body.status.missing).toContain("Estrutura de conversas no banco");
    expect(body.conversations).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/route-access-token|route-service-key|route-worker-token|route-test-secret|private database/);
  });

  it("rejects invalid conversation IDs before accessing message history", async () => {
    const response = await conversationGET(request("/api/admin/legisdot-comercial/conversas/not-a-uuid"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(400);
    expect(mocks.conversation).not.toHaveBeenCalled();
    expect(mocks.messages).not.toHaveBeenCalled();
  });

  it("returns 404 for an absent conversation without fetching messages", async () => {
    mocks.conversation.mockResolvedValue(null);
    const response = await conversationGET(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`), context());
    expect(response.status).toBe(404);
    expect(mocks.messages).not.toHaveBeenCalled();
  });

  it("honors the storage refusal to resume an opted-out conversation", async () => {
    mocks.changeConversation.mockResolvedValue(false);
    const response = await conversationPATCH(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`, "PATCH", { action: "resume" }), context());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Conversa indisponível ou contato interrompido pelo cliente." });
    expect(mocks.changeConversation).toHaveBeenCalledExactlyOnceWith(conversationId, "resume");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("accepts pause/resume only and does not send messages when an admin takes over", async () => {
    const invalid = await conversationPATCH(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`, "PATCH", { action: "send" }), context());
    expect(invalid.status).toBe(400);
    expect(mocks.changeConversation).not.toHaveBeenCalled();
    const paused = await conversationPATCH(request(`/api/admin/legisdot-comercial/conversas/${conversationId}`, "PATCH", { action: "pause" }), context());
    expect(paused.status).toBe(200);
    expect(mocks.changeConversation).toHaveBeenCalledExactlyOnceWith(conversationId, "pause");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });
});

describe("LegisDot WhatsApp webhook route", () => {
  it("echoes the verified challenge as plaintext, not JSON", async () => {
    const response = await webhookGET(new Request(`${origin}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=route-verify-token&hub.challenge=123456`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("123456");
    expectNoCustomerEffects();
  });

  it.each([
    "hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123",
    "hub.mode=unsubscribe&hub.verify_token=route-verify-token&hub.challenge=123",
    "hub.mode=subscribe&hub.verify_token=route-verify-token",
  ])("rejects a mismatched challenge request: %s", async (query) => {
    expect((await webhookGET(new Request(`${origin}/api/webhooks/whatsapp?${query}`))).status).toBe(403);
    expectNoCustomerEffects();
  });

  it("does not receive or schedule anything while disabled", async () => {
    vi.stubEnv("LEGISDOT_WHATSAPP_MODE", "disabled");
    const response = await webhookPOST(signedWebhook(payload()));
    expect(response.status).toBe(503);
    expectNoCustomerEffects();
  });

  it("rejects invalid HMAC before parsing or persisting a message", async () => {
    const response = await webhookPOST(signedWebhook(payload(), `sha256=${"0".repeat(64)}`));
    expect(response.status).toBe(403);
    expectNoCustomerEffects();
  });

  it("rejects malformed signed JSON without scheduling work", async () => {
    const response = await webhookPOST(signedWebhook("{"));
    expect(response.status).toBe(400);
    expectNoCustomerEffects();
  });

  it("persists a signed message before ACK and only schedules processing after persistence", async () => {
    const sequence: string[] = [];
    mocks.ingestMessage.mockImplementation(async () => { sequence.push("persisted"); return true; });
    mocks.after.mockImplementation(() => { sequence.push("scheduled"); });
    const response = await webhookPOST(signedWebhook(payload()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(sequence).toEqual(["persisted", "scheduled"]);
    expect(mocks.ingestMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "wamid.inbound-test", phoneNumberId, kind: "text", text: "Quero estudar grátis",
      recipient: { kind: "phone", value: "5511999999999" },
    }), "shadow", null);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    const callback = mocks.after.mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(mocks.process).toHaveBeenCalledOnce();
  });

  it("persists the opt-out control alongside the message before the worker runs", async () => {
    mocks.control.mockReturnValue("opt_out");
    const response = await webhookPOST(signedWebhook(payload("Pare")));
    expect(response.status).toBe(200);
    expect(mocks.control).toHaveBeenCalledExactlyOnceWith("Pare");
    expect(mocks.ingestMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "Pare" }), "shadow", "opt_out");
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("fails with 503 and no ACK or scheduled worker if durable persistence fails", async () => {
    mocks.ingestMessage.mockRejectedValue(new Error("sensitive database failure"));
    const response = await webhookPOST(signedWebhook(payload()));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.received).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("sensitive database failure");
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("records signed delivery events without treating them as customer messages", async () => {
    const body = payload();
    const value: Record<string, unknown> = body.entry[0].changes[0].value;
    delete value.messages;
    value.statuses = [{ id: "wamid.outbound-test", timestamp: String(Math.floor(Date.now() / 1000)), status: "delivered", biz_opaque_callback_data: conversationId }];
    const response = await webhookPOST(signedWebhook(body));
    expect(response.status).toBe(200);
    expect(mocks.ingestStatus).toHaveBeenCalledWith(expect.objectContaining({ messageId: "wamid.outbound-test", status: "delivered", correlationId: conversationId }), phoneNumberId);
    expect(mocks.ingestMessage).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("ignores envelopes for another business phone number", async () => {
    const body = payload();
    body.entry[0].changes[0].value.metadata.phone_number_id = "987654321";
    expect((await webhookPOST(signedWebhook(body))).status).toBe(200);
    expectNoCustomerEffects();
  });
});

describe("LegisDot recovery worker authentication", () => {
  it.each([undefined, "route-worker-token", "Bearer wrong-token", "Basic route-worker-token"])("requires the full bearer credential: %s", async (authorization) => {
    const response = await workerPOST(request("/api/internal/legisdot-comercial/processar", "POST", undefined,
      authorization ? { Authorization: authorization } : {}));
    expect(response.status).toBe(401);
    expectNoCustomerEffects();
  });

  it("stays closed without a configured token", async () => {
    vi.stubEnv("LEGISDOT_WORKER_TOKEN", "");
    const response = await workerGET(request("/api/internal/legisdot-comercial/processar", "GET", undefined, { Authorization: "Bearer " }));
    expect(response.status).toBe(401);
    expectNoCustomerEffects();
  });

  it("runs one processing step with the verified credential and no browser admin session", async () => {
    mocks.admin.mockResolvedValue(null);
    const response = await workerGET(request("/api/internal/legisdot-comercial/processar", "GET", undefined, { Authorization: "Bearer route-worker-token" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: false });
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
