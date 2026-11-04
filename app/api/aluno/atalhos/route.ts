import { loadStudentShortcuts, setStudentShortcutColor, studentShortcutsErrorResponse } from "@/lib/student-shortcuts-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return Response.json({ success: true, ...(await loadStudentShortcuts(request)) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return studentShortcutsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ success: false, message: "Conteúdo inválido." }, { status: 415 });
    const body = await request.json() as Record<string, unknown>;
    await setStudentShortcutColor(request, body.leiId, body.cor);
    return Response.json({ success: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return studentShortcutsErrorResponse(error);
  }
}
