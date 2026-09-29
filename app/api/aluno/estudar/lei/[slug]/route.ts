import { lawStudyErrorResponse, loadLawStudy } from "@/lib/law-study-server";
import { authorizeLawQuestionScope } from "@/lib/law-question-scope-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const recorteId = new URL(request.url).searchParams.get("recorte_id");
    const authorization = recorteId ? await authorizeLawQuestionScope(request, slug, recorteId) : undefined;
    const study = await loadLawStudy(request, slug, authorization);
    return Response.json({ success: true, study }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
