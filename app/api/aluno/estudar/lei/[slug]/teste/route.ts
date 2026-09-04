import { cacheHeaders, testCampaignAnswers } from "@/lib/law-campaign-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try { return Response.json({ success: true, ...(await testCampaignAnswers(request, (await context.params).slug)) }, { headers: cacheHeaders }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
