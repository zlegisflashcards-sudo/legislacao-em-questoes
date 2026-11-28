import { salesConfig } from "@/lib/legisdot-comercial/config";
import { privateJson, salesError, secretsEqual } from "@/lib/legisdot-comercial/http";
import { processNextSalesMessage } from "@/lib/legisdot-comercial/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const token = salesConfig().workerToken;
  if (!token || !secretsEqual(request.headers.get("authorization") ?? "", `Bearer ${token}`)) return privateJson({ error: "Não autorizado." }, 401);
  try { return privateJson(await processNextSalesMessage()); } catch (error) { return salesError(error); }
}
export const GET = POST;
