import { downloadAuthorizedLawScopeApkg } from "@/lib/law-apkg-scope-download-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  let slug = "desconhecida";
  try {
    slug = (await params).slug;
    return await downloadAuthorizedLawScopeApkg(request, slug, new URL(request.url).searchParams.get("recorte_id"));
  } catch (error) {
    const technical = error && typeof error === "object" ? error as { code?: unknown; details?: unknown; hint?: unknown } : {};
    console.error("Falha ao gerar APKG", {
      slug,
      message: error instanceof Error ? error.message : "erro desconhecido",
      stack: error instanceof Error ? error.stack : undefined,
      code: technical.code,
      details: technical.details,
      hint: technical.hint,
    });
    return lawStudyErrorResponse(error);
  }
}
