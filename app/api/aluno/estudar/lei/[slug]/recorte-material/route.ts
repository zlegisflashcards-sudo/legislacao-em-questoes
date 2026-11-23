import { lawStudyErrorResponse, LawStudyApiError } from "@/lib/law-study-server";
import { loadScopedStudyMaterial } from "@/lib/scoped-study-material-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    const mode = query.get("mode");
    const [scopeId] = query.getAll("recorte_id");
    if ((mode !== "reading" && mode !== "audio") || query.getAll("mode").length !== 1 || query.getAll("recorte_id").length !== 1 || !scopeId) throw new LawStudyApiError(400, "Informe o modo e o recorte.");
    return Response.json(await loadScopedStudyMaterial(request, (await context.params).slug, scopeId, mode), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) { return lawStudyErrorResponse(error); }
}
