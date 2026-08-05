import { dashboardErrorResponse, registerDailyReview } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return Response.json(
      { success: true, revisao: await registerDailyReview(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
