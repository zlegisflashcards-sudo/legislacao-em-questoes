import { NextRequest, NextResponse } from "next/server";
import { authorizeLawStudy, lawStudyErrorResponse, loadLawStudy } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

/** Retorna apenas o identificador do PDF que o aluno já está autorizado a baixar. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const authorization = await authorizeLawStudy(request, slug);
    const study = await loadLawStudy(request, slug, authorization);
    const pdf = study.materials.find((material) => material.type === "pdf" && material.accessAvailable);
    return NextResponse.json({ materialId: pdf?.id ?? null }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
