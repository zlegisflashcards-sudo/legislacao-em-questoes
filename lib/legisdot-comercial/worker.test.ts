import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesConversation, SalesJob } from "./store";
import type { SalesReply } from "./types";

const mocks = vi.hoisted(() => ({
  config: vi.fn(), configurationStatus: vi.fn(), catalog: vi.fn(), reply: vi.fn(),
  claim: vi.fn(), conversation: vi.fn(), history: vi.fn(), save: vi.fn(),
  update: vi.fn(), prepare: vi.fn(), accept: vi.fn(), retry: vi.fn(), send: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ salesConfig: mocks.config, configurationStatus: mocks.configurationStatus }));
vi.mock("./catalog", () => ({ loadSalesCatalog: mocks.catalog }));
vi.mock("./reply", () => ({ createSalesReply: mocks.reply }));
vi.mock("./store", () => ({
  claimSalesJob: mocks.claim,
  getSalesConversation: mocks.conversation,
  salesHistory: mocks.history,
  saveSalesReply: mocks.save,
  updateSalesJob: mocks.update,
  prepareSalesSend: mocks.prepare,
  acceptSalesSend: mocks.accept,
  retrySalesJob: mocks.retry,
}));
vi.mock("./whatsapp", async (importOriginal) => ({
  ...await importOriginal<typeof import("./whatsapp")>(),
  sendWhatsAppText: mocks.send,
}));

import { WhatsAppSendError } from "./whatsapp";
import { processNextSalesMessage } from "./worker";

const now = new Date("2026-11-24T15:00:00.000Z");
const phoneNumberId = "123456789012345";
const recipient = "BR.customer1";
const phoneAlias = "5511987654321";
type Config = ReturnType<typeof import("./config").salesConfig>;

function config(overrides: Partial<Config> = {}): Config {
  return {
    mode: "live", phoneNumberId, accessToken: "test-access-token", appSecret: "test-app-secret",
    verifyToken: "test-verify-token", graphVersion: "v27.0", workerToken: "test-worker-token",
    allowlist: [recipient], allowAllRecipients: false, dailyLimit: 100, aiConfigured: false,
    ...overrides,
  };
}

function job(overrides: Partial<SalesJob> = {}): SalesJob {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    conversation_id: "00000000-0000-4000-8000-000000000002",
    phone_number_id: phoneNumberId, inbound_text: "Quero estudar a Constituição.", input_kind: "text",
    received_at: "2026-11-24T14:59:55.000Z", mode: "live", control_action: null,
    claim_token: "00000000-0000-4000-8000-000000000003", state: "processing", reply_text: null,
    created_at: "2026-11-24T14:59:56.000Z", attempts: 1,
    ...overrides,
  };
}

function conversation(overrides: Partial<SalesConversation> = {}): SalesConversation {
  return {
    id: "00000000-0000-4000-8000-000000000002", phone_number_id: phoneNumberId,
    recipient_kind: "bsuid", recipient_value: recipient, phone_alias: phoneAlias, display_name: "Ana",
    status: "bot", paused_by_admin: false, stage: "qualificacao",
    last_inbound_at: "2026-11-24T14:59:55.000Z", updated_at: "2026-11-24T14:59:55.000Z",
    ...overrides,
  };
}

function reply(overrides: Partial<SalesReply> = {}): SalesReply {
  return {
    text: "Sou o LegisDot, assistente virtual. Qual concurso você está estudando?",
    stage: "qualificacao", handoff: false, optOut: false, productIds: [], engine: "rules", reason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network access in worker test")));
  mocks.config.mockReturnValue(config());
  mocks.configurationStatus.mockReturnValue({ configured: true });
  mocks.claim.mockResolvedValue(job());
  mocks.conversation.mockResolvedValue(conversation());
  mocks.catalog.mockResolvedValue([]);
  mocks.history.mockResolvedValue([]);
  mocks.reply.mockResolvedValue(reply());
  mocks.save.mockResolvedValue(true);
  mocks.update.mockResolvedValue(undefined);
  mocks.prepare.mockResolvedValue("send");
  mocks.send.mockResolvedValue({ messageId: "wamid.outbound" });
  mocks.accept.mockResolvedValue(undefined);
  mocks.retry.mockResolvedValue(true);
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LegisDot worker execution gates", () => {
  it("does not claim, generate or send when globally disabled", async () => {
    mocks.config.mockReturnValue(config({ mode: "disabled" }));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: false, result: "disabled" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("claims only the configured business number and stops when its queue is empty", async () => {
    mocks.claim.mockResolvedValue(null);
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: false, result: "empty" });
    expect(mocks.claim).toHaveBeenCalledWith(phoneNumberId);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps a shadow job as a persisted draft even if current configuration is live", async () => {
    const pending = job({ mode: "shadow" });
    mocks.claim.mockResolvedValue(pending);
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "draft" });
    expect(mocks.save).toHaveBeenCalledWith(pending, reply());
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("does not send a live reply to a recipient outside the allowlist", async () => {
    mocks.config.mockReturnValue(config({ allowlist: ["BR.someoneElse"] }));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "draft" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "draft", "recipient_restricted", ["ready"]);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends one prepared reply to an explicitly allowed BSUID and records acceptance", async () => {
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "accepted" });
    expect(mocks.prepare).toHaveBeenCalledWith(job(), 100);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      phoneNumberId, accessToken: "test-access-token", graphVersion: "v27.0",
      recipient: { kind: "bsuid", value: recipient }, text: reply().text, correlationId: job().id,
    });
    expect(mocks.accept).toHaveBeenCalledWith(job(), "wamid.outbound");
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("accepts the verified phone alias in the allowlist while sending to the canonical BSUID", async () => {
    mocks.config.mockReturnValue(config({ allowlist: [phoneAlias] }));
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "accepted" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].recipient).toEqual({ kind: "bsuid", value: recipient });
  });

  it("allows all recipients only when that setting is explicitly enabled", async () => {
    mocks.config.mockReturnValue(config({ allowlist: [], allowAllRecipients: true }));
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "accepted" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("rechecks a disabled configuration after drafting and before the POST", async () => {
    mocks.config.mockReturnValueOnce(config()).mockReturnValue(config({ mode: "disabled" }));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "draft" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "draft", "sending_disabled", ["ready"]);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send with incomplete credentials even in live mode", async () => {
    mocks.configurationStatus.mockReturnValue({ configured: false });
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "draft" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "draft", "sending_disabled", ["ready"]);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["human", "opted_out"] as const)("does not answer ordinary messages in a %s conversation", async (status) => {
    mocks.conversation.mockResolvedValue(conversation({ status }));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "human_or_opted_out" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "ignored", "human_or_opted_out");
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { status: "human", control: "human", optOut: false },
    { status: "opted_out", control: "opt_out", optOut: true },
  ] as const)("allows only the acknowledgement of an explicit $control request", async ({ status, control, optOut }) => {
    const pending = job({ control_action: control, inbound_text: optOut ? "PARAR" : "Quero um atendente" });
    const acknowledgement = reply({ text: optOut ? "Entendido, interromperei as mensagens." : "O atendimento ficará com a equipe.", stage: "humano", handoff: true, optOut });
    mocks.claim.mockResolvedValue(pending);
    mocks.conversation.mockResolvedValue(conversation({ status }));
    mocks.reply.mockResolvedValue(acknowledgement);
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "accepted" });
    expect(mocks.save).toHaveBeenCalledWith(pending, acknowledgement);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].text).toBe(acknowledgement.text);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("honors an administrator pause even for a controlled acknowledgement", async () => {
    const pending = job({ control_action: "human" });
    mocks.claim.mockResolvedValue(pending);
    mocks.conversation.mockResolvedValue(conversation({ status: "human", paused_by_admin: true }));
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "human_or_opted_out" });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it("blocks expired service windows before fetching the catalog or generating a reply", async () => {
    mocks.conversation.mockResolvedValue(conversation({ last_inbound_at: "2026-11-23T15:00:00.000Z" }));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "window_closed" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "ignored", "window_closed");
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["superseded", "opted_out", "window_closed", "paused", "daily_limit", "lease_lost"])(
    "honors the atomic SQL veto %s immediately before sending",
    async (reason) => {
      mocks.prepare.mockResolvedValue(reason);
      await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: reason });
      expect(mocks.send).not.toHaveBeenCalled();
      expect(mocks.accept).not.toHaveBeenCalled();
    },
  );

  it("does not send when its generation lease was lost before saving the reply", async () => {
    mocks.save.mockResolvedValue(false);
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "lease_lost" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("marks unsupported media for human attention without claiming that the file was delivered", async () => {
    const pending = job({ input_kind: "unsupported", inbound_text: "[Mensagem de áudio recebida]" });
    mocks.claim.mockResolvedValue(pending);
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "accepted" });
    expect(mocks.reply).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(pending, expect.objectContaining({ handoff: true, reason: "unsupported_media" }));
    expect(mocks.send.mock.calls[0][0].text).not.toMatch(/encaminhar este arquivo|arquivo.*enviado/i);
  });
});

describe("LegisDot worker retry boundaries", () => {
  it("records POST timeout as uncertain and never retries the POST or the job", async () => {
    mocks.send.mockRejectedValue(new WhatsAppSendError("Resultado desconhecido", "timeout", true));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "uncertain" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(job(), "uncertain", "timeout", ["sending"]);
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("records an explicit provider rejection as failed without automatic retry", async () => {
    mocks.send.mockRejectedValue(new WhatsAppSendError("Janela fechada", "meta_131047", false));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "failed" });
    expect(mocks.update).toHaveBeenCalledWith(job(), "failed", "meta_131047", ["sending"]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("records failure to persist acceptance as uncertain, without sending a second message", async () => {
    mocks.accept.mockRejectedValue(new Error("Storage unavailable after provider acceptance"));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "uncertain" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.accept).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(job(), "uncertain", "send_result_unknown", ["sending"]);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("treats an unexpected transport exception as an uncertain send", async () => {
    mocks.send.mockRejectedValue(new Error("Unknown transport failure"));
    await expect(processNextSalesMessage()).resolves.toMatchObject({ result: "uncertain" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(job(), "uncertain", "send_result_unknown", ["sending"]);
    expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("requeues a transient catalog failure before any POST", async () => {
    mocks.catalog.mockRejectedValue(new Error("Temporary catalog outage"));
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "retry_pending" });
    expect(mocks.retry).toHaveBeenCalledWith(job());
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("stops retrying pre-send failures when persistence reports the attempt limit was reached", async () => {
    const pending = job({ attempts: 3 });
    mocks.claim.mockResolvedValue(pending);
    mocks.catalog.mockRejectedValue(new Error("Catalog still unavailable"));
    mocks.retry.mockResolvedValue(false);
    await expect(processNextSalesMessage()).resolves.toEqual({ processed: true, result: "failed" });
    expect(mocks.retry).toHaveBeenCalledWith(pending);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
