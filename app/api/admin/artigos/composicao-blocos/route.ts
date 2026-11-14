import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { obterAdministrador } from "@/lib/admin-auth";
import { applyArticleBlockComposition, archiveArticleBlocks, previewArticleBlockComposition, taxArticleBlocks } from "@/lib/admin-article-block-composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "preview") return NextResponse.json(await previewArticleBlockComposition({ lawSlug: body.law, mode: body.mode, referenceIds: body.reference_ids, pieces: body.pieces }), { headers: { "Cache-Control": "no-store" } });
    if (body.action === "apply") {
      const result = await applyArticleBlockComposition({ operation: body.operation, expected: body.expected, commentTreatment: body.comment_treatment });
      revalidatePath("/admin/artigos"); revalidatePath("/admin/artigos/legisbot-preview");
      return NextResponse.json(result);
    }
    if (body.action === "archive") {
      const result = await archiveArticleBlocks({ lawSlug: body.law, referenceIds: body.reference_ids });
      revalidatePath("/admin/artigos"); revalidatePath("/admin/artigos/legisbot-preview");
      return NextResponse.json(result);
    }
    if (body.action === "tax") {
      const result = await taxArticleBlocks({ lawSlug: body.law, referenceIds: body.reference_ids });
      revalidatePath("/admin/artigos"); revalidatePath("/admin/artigos/legisbot-preview");
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Ação de composição inválida." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível compor os blocos." }, { status: 400 }); }
}
