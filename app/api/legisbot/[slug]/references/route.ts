import { NextRequest, NextResponse } from "next/server";
import { getContinuousReadingBlocks, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const offset = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(60, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10) || 30));
  try {
    const model = await getContinuousReadingModel(slug);
    if (!model) return NextResponse.json({ error: "Legislação não encontrada." }, { status: 404 });
    if (!model.integrity.readingAvailable) return NextResponse.json({ error: "A leitura contínua ainda possui vínculos pendentes." }, { status: 409 });
    const blocks = await getContinuousReadingBlocks(model, offset, limit);
    return NextResponse.json({ blocks, offset, limit, total: model.integrity.availableBlocks });
  } catch (error) {
    console.error("[LegisBot] Falha ao carregar página progressiva da legislação.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Não foi possível carregar esta parte da legislação." }, { status: 503 });
  }
}
