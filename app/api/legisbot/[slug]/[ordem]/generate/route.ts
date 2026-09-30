import { getRequestUser } from "@/lib/legisbot-community-server";
import { handleLegisBotGenerationPost } from "@/lib/legisbot/generation-api";
import { createSupabaseGenerationRepository, reconcileLegisBotCommentSource } from "@/lib/legisbot/generation-repository";
import { findLegisBotSource } from "@/lib/legisbot/source";
import { enviarAlertaFaltaDeCreditosOpenAI } from "@/lib/legisbot/openai-quota-alert";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };

export async function POST(request: Request, context: RouteContext) {
  const supabase = getSupabaseServerClient();
  return handleLegisBotGenerationPost(request, await context.params, {
    authenticate: getRequestUser,
    getRepository: () => createSupabaseGenerationRepository(supabase),
    resolveSource: (identifiers) => findLegisBotSource(supabase, identifiers),
    reconcileSource: (source) => reconcileLegisBotCommentSource(supabase, source),
    alertQuota: enviarAlertaFaltaDeCreditosOpenAI,
    logError: (message) => console.error(`[LegisBot] ${message}`),
  });
}
