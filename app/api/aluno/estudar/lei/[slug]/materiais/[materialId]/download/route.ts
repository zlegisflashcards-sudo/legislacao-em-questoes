import { downloadAuthorizedLawMaterial } from "@/lib/law-material-download-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; materialId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug, materialId } = await context.params;
    return await downloadAuthorizedLawMaterial(request, slug, materialId);
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
