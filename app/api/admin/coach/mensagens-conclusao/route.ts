import { coachCompletionMessages, coachErrorResponse, createCompletionMessage } from "@/lib/coach-admin-server";

const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  try { return Response.json(await coachCompletionMessages(), { headers }); }
  catch (error) { return coachErrorResponse(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await createCompletionMessage(await request.json()), { status: 201, headers }); }
  catch (error) { return coachErrorResponse(error); }
}
