import { deletePdfHighlight } from "@/lib/legiscast-pdf-highlights-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string; materialId: string; highlightId: string }> };

export async function DELETE(request: Request, context: Context) { try { const { slug, materialId, highlightId } = await context.params; await deletePdfHighlight(request, slug, materialId, highlightId); return new Response(null, { status: 204 }); } catch (error) { return lawStudyErrorResponse(error); } }
