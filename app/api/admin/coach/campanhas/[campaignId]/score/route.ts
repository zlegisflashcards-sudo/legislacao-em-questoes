import { adjustCampaignScore, coachErrorResponse } from "@/lib/coach-admin-server";
export async function PATCH(request: Request, { params }: { params: Promise<{ campaignId: string }> }) { try { const body = await request.json(); return Response.json(await adjustCampaignScore({ ...body, campaignId: (await params).campaignId })); } catch (error) { return coachErrorResponse(error); } }
