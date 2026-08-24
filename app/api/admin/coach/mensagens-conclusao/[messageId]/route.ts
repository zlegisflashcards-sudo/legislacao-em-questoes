import { coachErrorResponse, deleteCompletionMessage, updateCompletionMessage } from "@/lib/coach-admin-server";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
type Context = { params: Promise<{ messageId: string }> };

export async function PATCH(request: Request, context: Context) {
  try { return Response.json(await updateCompletionMessage((await context.params).messageId, await request.json()), { headers }); }
  catch (error) { return coachErrorResponse(error); }
}

export async function DELETE(_: Request, context: Context) {
  try { return Response.json(await deleteCompletionMessage((await context.params).messageId), { headers }); }
  catch (error) { return coachErrorResponse(error); }
}
