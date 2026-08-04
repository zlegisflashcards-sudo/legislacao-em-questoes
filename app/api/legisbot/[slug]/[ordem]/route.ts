import { findLegisBotComment } from "@/lib/legisbot/generation-repository";
import { handleLegisBotRead } from "@/lib/legisbot/read-api";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return handleLegisBotRead(
    await context.params,
    (identifiers) => findLegisBotComment(getSupabaseServerClient(), identifiers),
  );
}
