import { lawStudyErrorResponse } from "@/lib/law-study-server";
import { authorizeLawStudyContexts } from "@/lib/law-question-scope-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const { contexts } = await authorizeLawStudyContexts(request, slug);
    return Response.json({ success: true, contexts }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
