import { lawStudyErrorResponse, updateLawProgress } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return Response.json({ success: false, message: "Conteúdo inválido." }, { status: 415, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    const { slug } = await context.params;
    const progress = await updateLawProgress(request, slug, await request.json());
    return Response.json({ success: true, progress }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
