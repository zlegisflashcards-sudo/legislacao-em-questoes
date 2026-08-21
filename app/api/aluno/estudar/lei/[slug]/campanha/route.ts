import { answerCampaign, cacheHeaders, campaignState, resetCampaign, startCampaign } from "@/lib/law-campaign-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try { return Response.json({ success: true, ...(await campaignState(request, (await context.params).slug)) }, { headers: cacheHeaders }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try { return Response.json({ success: true, ...(await startCampaign(request, (await context.params).slug)) }, { headers: cacheHeaders }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { return Response.json({ success: true, ...(await answerCampaign(request, (await context.params).slug, await request.json())) }, { headers: cacheHeaders }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  try { return Response.json({ success: true, ...(await resetCampaign(request, (await context.params).slug)) }, { headers: cacheHeaders }); }
  catch (error) { return lawStudyErrorResponse(error); }
}
