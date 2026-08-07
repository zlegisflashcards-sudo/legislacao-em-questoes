import { lawStudyErrorResponse, loadLawStudy } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const study = await loadLawStudy(request, slug);
    return Response.json({ success: true, study }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
