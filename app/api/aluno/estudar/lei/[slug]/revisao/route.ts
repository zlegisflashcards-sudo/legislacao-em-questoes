import { lawStudyErrorResponse } from "@/lib/law-study-server";
import { reviewState, toggleFavorite, type ReviewKind } from "@/lib/law-review-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const kinds = new Set<ReviewKind>(["errors", "favorites", "unanswered"]);
export async function GET(request: Request, context: Context) {
  try { const kind = new URL(request.url).searchParams.get("tipo"); if (kind && !kinds.has(kind as ReviewKind)) return Response.json({ success: false, message: "Revisão inválida." }, { status: 400 }); return Response.json({ success: true, ...(await reviewState(request, (await context.params).slug, kind as ReviewKind | undefined)) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
export async function POST(request: Request, context: Context) { try { return Response.json({ success: true, ...(await toggleFavorite(request, (await context.params).slug, await request.json())) }); } catch (error) { return lawStudyErrorResponse(error); } }
