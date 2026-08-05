import { dashboardErrorResponse, loadDashboardData } from "@/lib/dashboard-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json(
      { success: true, dashboard: await loadDashboardData(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return dashboardErrorResponse(error);
  }
}
