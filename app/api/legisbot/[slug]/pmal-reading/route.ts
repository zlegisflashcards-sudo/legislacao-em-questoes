import { lawStudyErrorResponse, LawStudyApiError } from "@/lib/law-study-server";
import { loadCppPmalReading } from "@/lib/legisbot/cpp-pmal-reading-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const scopes = new URL(request.url).searchParams.getAll("recorte_id");
    if (scopes.length !== 1) throw new LawStudyApiError(400, "Informe um único recorte.");
    return Response.json(await loadCppPmalReading(request, (await params).slug, scopes[0]), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
