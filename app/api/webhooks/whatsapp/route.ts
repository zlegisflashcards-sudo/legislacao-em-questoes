import { after } from "next/server";
import { salesConfig } from "@/lib/legisdot-comercial/config";
import { boundedBody, privateJson, salesError, secretsEqual } from "@/lib/legisdot-comercial/http";
import { parseWhatsAppEnvelope, verifyWhatsAppSignature } from "@/lib/legisdot-comercial/whatsapp";
import { detectSalesControl } from "@/lib/legisdot-comercial/reply";
import { ingestSalesMessage, ingestSalesStatus } from "@/lib/legisdot-comercial/store";
import { processNextSalesMessage } from "@/lib/legisdot-comercial/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const config = salesConfig(); const query = new URL(request.url).searchParams;
  if (!config.verifyToken) return privateJson({ error: "Integração não configurada." }, 503);
  const challenge = query.get("hub.challenge");
  if (query.get("hub.mode") !== "subscribe" || !challenge || challenge.length > 512 || !secretsEqual(query.get("hub.verify_token") ?? "", config.verifyToken)) {
    return privateJson({ error: "Verificação recusada." }, 403);
  }
  return new Response(challenge, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const config = salesConfig();
    if (config.mode === "disabled" || !config.appSecret || !config.phoneNumberId) return privateJson({ error: "Recepção não habilitada." }, 503);
    const raw = await boundedBody(request, 512_000);
    if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), config.appSecret)) return privateJson({ error: "Assinatura inválida." }, 403);
    let payload: unknown;
    try { payload = JSON.parse(raw.toString("utf8")); } catch { return privateJson({ error: "JSON inválido." }, 400); }
    const envelope = parseWhatsAppEnvelope(payload, config.phoneNumberId);
    for (const status of envelope.statuses) await ingestSalesStatus(status, config.phoneNumberId);
    for (const message of envelope.messages) await ingestSalesMessage(message, config.mode,
      message.kind === "text" ? detectSalesControl(message.text) : null);
    if (envelope.messages.length) after(async () => {
      try { await processNextSalesMessage(); } catch { console.warn("[legisdot-comercial] Fila pendente; recuperação pelo worker autenticado."); }
    });
    // ACK somente depois da persistência. Retry da Meta é deduplicado pelo banco.
    return privateJson({ received: true });
  } catch (error) { return salesError(error); }
}
