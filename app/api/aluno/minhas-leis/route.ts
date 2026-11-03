import { loadStudentLaws, StudentLawsApiError, studentLawsErrorResponse } from "@/lib/student-laws-server";
import { withStudentLawsTimeout } from "@/lib/student-laws-timeout";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const leis = await withStudentLawsTimeout(loadStudentLaws(request), () => new StudentLawsApiError(503, "O carregamento das suas leis demorou mais que o esperado. Tente novamente."));
    return Response.json({ leis, total: leis.length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    return studentLawsErrorResponse(error);
  }
}
