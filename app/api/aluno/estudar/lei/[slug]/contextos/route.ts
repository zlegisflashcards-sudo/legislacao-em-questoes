import { lawStudyErrorResponse, authorizeLawStudy } from "@/lib/law-study-server";
import { listLawStudyContexts } from "@/lib/law-question-scope-access";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const access = await authorizeLawStudy(request, slug);
    const contexts = await listLawStudyContexts(access.studentId, access.lawId);
    return Response.json({ success: true, contexts }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
