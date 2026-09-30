import { findLegisBotComment, reconcileLegisBotCommentSource } from "@/lib/legisbot/generation-repository";
import { handleLegisBotRead } from "@/lib/legisbot/read-api";
import { findLegisBotSource } from "@/lib/legisbot/source";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServerClient();
  return handleLegisBotRead(
    await context.params,
    {
      find: (identifiers) => findLegisBotComment(supabase, identifiers),
      resolveSource: (identifiers) => findLegisBotSource(supabase, identifiers),
      reconcileSource: (source) => reconcileLegisBotCommentSource(supabase, source),
    },
  );
}
