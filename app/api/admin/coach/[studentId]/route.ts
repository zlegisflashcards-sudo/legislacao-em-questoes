import { coachErrorResponse, coachStudent } from "@/lib/coach-admin-server";
export async function GET(_: Request, { params }: { params: Promise<{ studentId: string }> }) { try { return Response.json(await coachStudent((await params).studentId), { headers: { "Cache-Control": "private, no-store, max-age=0" } }); } catch (error) { return coachErrorResponse(error); } }
