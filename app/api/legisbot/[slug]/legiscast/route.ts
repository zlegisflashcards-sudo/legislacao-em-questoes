import { NextRequest, NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getAuthorizedLegiscastAudioForStructure, getLegiscastAudioForLaw } from "@/lib/legiscast-audios-server";
import { getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import { LawStudyApiError, lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

/** Entrega somente a faixa resolvida e autorizada para a estrutura solicitada. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const structureId = request.nextUrl.searchParams.get("structure_id");
    const administrator = await obterAdministrador();
    const result = administrator
      ? await (async () => {
        const model = await getContinuousReadingModel(slug);
        if (!model) throw new LawStudyApiError(404, "Lei não encontrada.");
        return getLegiscastAudioForLaw(model.law.id, structureId);
      })()
      : await getAuthorizedLegiscastAudioForStructure(request, slug, structureId);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
