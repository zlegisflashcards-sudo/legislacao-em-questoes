import { createPdfHighlight, listPdfHighlights } from "@/lib/legiscast-pdf-highlights-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string; materialId: string }> };

export async function GET(request: Request, context: Context) { try { const { slug, materialId } = await context.params; return Response.json({ highlights: await listPdfHighlights(request, slug, materialId) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return lawStudyErrorResponse(error); } }
export async function POST(request: Request, context: Context) { try { const { slug, materialId } = await context.params; return Response.json({ highlight: await createPdfHighlight(request, slug, materialId, await request.json()) }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return lawStudyErrorResponse(error); } }
