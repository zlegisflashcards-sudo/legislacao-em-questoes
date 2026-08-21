import { coachErrorResponse, coachStudents } from "@/lib/coach-admin-server";
export async function GET(request: Request) { try { return Response.json(await coachStudents(new URL(request.url)), { headers: { "Cache-Control": "private, no-store, max-age=0" } }); } catch (error) { return coachErrorResponse(error); } }
