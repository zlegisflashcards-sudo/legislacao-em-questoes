import { downloadAuthorizedLawScopeApkg } from "@/lib/law-apkg-scope-download-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) { try { const { slug } = await params; return await downloadAuthorizedLawScopeApkg(request, slug, new URL(request.url).searchParams.get("recorte_id")); } catch (error) { return lawStudyErrorResponse(error); } }
