import { downloadAuthorizedLawApkg } from "@/lib/law-apkg-download-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    return await downloadAuthorizedLawApkg(request, slug);
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
