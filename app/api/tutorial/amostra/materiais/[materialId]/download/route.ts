import { downloadPublicSampleLawMaterial } from "@/lib/law-material-download-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ materialId: string }> }) {
  try { return await downloadPublicSampleLawMaterial((await params).materialId); } catch (error) { return lawStudyErrorResponse(error); }
}
