import { listAuthorizedLegiscastAudios } from "@/lib/legiscast-audios-server";
import { rejectUncertifiedLegiscastScope } from "@/lib/legiscast-scope-pending";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const pending = rejectUncertifiedLegiscastScope(request);
  if (pending) return pending;
  try { return Response.json(await listAuthorizedLegiscastAudios(request, (await params).slug), { headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
