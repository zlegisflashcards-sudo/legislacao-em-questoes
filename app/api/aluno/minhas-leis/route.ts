import { loadStudentLaws, studentLawsErrorResponse } from "@/lib/student-laws-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const leis = await loadStudentLaws(request);
    return Response.json({ leis, total: leis.length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return studentLawsErrorResponse(error);
  }
}
