import { listAuthorizedLegiscastAudios } from "@/lib/legiscast-audios-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try { return Response.json(await listAuthorizedLegiscastAudios(request, (await params).slug), { headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
