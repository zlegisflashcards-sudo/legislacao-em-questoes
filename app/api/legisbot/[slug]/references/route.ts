import { NextRequest, NextResponse } from "next/server";
import { getContinuousReadingBlockTextsForLaw } from "@/lib/legisbot/continuous-reading-server";

export const dynamic = "force-dynamic";
const MAXIMUM_BLOCKS = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const referenceIds = (request.nextUrl.searchParams.get("reference_ids") ?? "").split(",").slice(0, MAXIMUM_BLOCKS);
  if (!referenceIds.length || !referenceIds.some(Boolean)) return NextResponse.json({ error: "Selecione os blocos da leitura." }, { status: 400 });
  try {
    const blocks = await getContinuousReadingBlockTextsForLaw(slug, referenceIds);
    if (blocks === null) return NextResponse.json({ error: "Legislação não encontrada." }, { status: 404 });
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("[LegisBot] Falha ao carregar página progressiva da legislação.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Não foi possível carregar esta parte da legislação." }, { status: 503 });
  }
}
