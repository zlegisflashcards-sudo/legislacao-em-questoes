import { configurationStatus } from "@/lib/legisdot-comercial/config";
import { loadSalesCatalog } from "@/lib/legisdot-comercial/catalog";
import { listSalesConversations } from "@/lib/legisdot-comercial/store";
import { privateJson, requireSalesAdmin, salesError } from "@/lib/legisdot-comercial/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireSalesAdmin(request);
    const [conversations, catalog] = await Promise.allSettled([listSalesConversations(), loadSalesCatalog()]);
    const status = configurationStatus();
    if (conversations.status === "rejected") status.missing.push("Estrutura de conversas no banco");
    if (catalog.status === "rejected") status.missing.push("Consulta ao catálogo comercial");
    return privateJson({ status: { ...status, databaseReady: conversations.status === "fulfilled" },
      conversations: conversations.status === "fulfilled" ? conversations.value : [],
      catalogCount: catalog.status === "fulfilled" ? catalog.value.length : 0 });
  } catch (error) { return salesError(error); }
}
