import "server-only";

export type SalesMode = "disabled" | "shadow" | "live";

export function salesConfig() {
  const rawMode = process.env.LEGISDOT_WHATSAPP_MODE;
  const mode: SalesMode = rawMode === "shadow" || rawMode === "live" ? rawMode : "disabled";
  const integer = (value: string | undefined, fallback: number, max: number) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
  };
  return {
    mode,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v27.0",
    workerToken: process.env.LEGISDOT_WORKER_TOKEN?.trim() ?? "",
    allowlist: (process.env.LEGISDOT_WHATSAPP_ALLOWLIST ?? "").split(",").map((v) => v.trim().replace(/^\+/, "")).filter(Boolean),
    allowAllRecipients: process.env.LEGISDOT_WHATSAPP_ALLOW_ALL === "true",
    dailyLimit: integer(process.env.LEGISDOT_MAX_REPLIES_PER_DAY, 100, 10000),
    aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}

export function configurationStatus() {
  const config = salesConfig();
  const missing: string[] = [];
  if (!/^\d+$/.test(config.phoneNumberId)) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!config.appSecret) missing.push("WHATSAPP_APP_SECRET");
  if (!config.verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (!config.accessToken) missing.push("WHATSAPP_ACCESS_TOKEN");
  if (!config.workerToken) missing.push("LEGISDOT_WORKER_TOKEN");
  if (!/^v\d+\.\d+$/.test(config.graphVersion)) missing.push("WHATSAPP_GRAPH_VERSION");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("Supabase no servidor");
  return {
    mode: config.mode,
    configured: missing.length === 0,
    missing,
    aiConfigured: config.aiConfigured,
    webhookPath: "/api/webhooks/whatsapp",
    allowlistRequired: !config.allowAllRecipients && config.allowlist.length === 0,
  };
}
