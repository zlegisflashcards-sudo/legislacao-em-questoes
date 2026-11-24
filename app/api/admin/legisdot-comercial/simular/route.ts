import { loadSalesCatalog } from "@/lib/legisdot-comercial/catalog";
import { createSalesReply } from "@/lib/legisdot-comercial/reply";
import { privateJson, readSalesJson, requireSalesAdmin, salesError, SalesHttpError } from "@/lib/legisdot-comercial/http";
import type { SalesTurn } from "@/lib/legisdot-comercial/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    await requireSalesAdmin(request, true);
    const body = await readSalesJson(request, 80_000);
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000) throw new SalesHttpError(400, "Envie uma mensagem de até 2.000 caracteres.");
    const rawHistory = body.history ?? [];
    if (!Array.isArray(rawHistory) || rawHistory.length > 16) throw new SalesHttpError(400, "Histórico inválido.");
    const history: SalesTurn[] = [];
    for (const turn of rawHistory) {
      if (!turn || (turn.role !== "user" && turn.role !== "assistant") || typeof turn.content !== "string" || turn.content.length > 4096) throw new SalesHttpError(400, "Histórico inválido.");
      history.push({ role: turn.role, content: turn.content });
    }
    if (body.useAI !== undefined && typeof body.useAI !== "boolean") throw new SalesHttpError(400, "Opção de IA inválida.");
    const catalog = await loadSalesCatalog();
    const reply = await createSalesReply({ message: body.message.trim(), history, catalog, useAI: body.useAI === true });
    // Simular não grava contatos, não cria jobs e nunca importa o conector de envio.
    return privateJson({ reply, catalogCount: catalog.length });
  } catch (error) { return salesError(error); }
}
