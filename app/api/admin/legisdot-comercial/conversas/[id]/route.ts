import { changeSalesConversation, getSalesConversation, listSalesMessages, validSalesId } from "@/lib/legisdot-comercial/store";
import { privateJson, readSalesJson, requireSalesAdmin, salesError, SalesHttpError } from "@/lib/legisdot-comercial/http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function conversationId(context: Context) {
  const { id } = await context.params;
  if (!validSalesId(id)) throw new SalesHttpError(400, "Conversa inválida.");
  return id;
}
export async function GET(request: Request, context: Context) {
  try {
    await requireSalesAdmin(request);
    const id = await conversationId(context);
    if (!await getSalesConversation(id)) throw new SalesHttpError(404, "Conversa não encontrada.");
    return privateJson({ messages: await listSalesMessages(id) });
  } catch (error) { return salesError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireSalesAdmin(request, true);
    const id = await conversationId(context);
    const body = await readSalesJson(request, 1024);
    if (body.action !== "pause" && body.action !== "resume") throw new SalesHttpError(400, "Ação inválida.");
    if (!await changeSalesConversation(id, body.action)) throw new SalesHttpError(409, "Conversa indisponível ou contato interrompido pelo cliente.");
    return privateJson({ ok: true });
  } catch (error) { return salesError(error); }
}
