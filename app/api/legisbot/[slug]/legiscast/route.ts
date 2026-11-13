import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedLegiscastAudioForStructure } from "@/lib/legiscast-audios-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

/** Entrega somente a faixa resolvida e autorizada para a estrutura solicitada. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const result = await getAuthorizedLegiscastAudioForStructure(request, slug, request.nextUrl.searchParams.get("structure_id"));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
