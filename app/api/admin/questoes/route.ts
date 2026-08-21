import { NextResponse } from "next/server";
import {
  AdminQuestoesError,
  createAdminQuestion,
  createStructureNode,
  deactivateStructureNode,
  deleteStructureNode,
  structureDeletionSummary,
  deactivateAdminQuestion,
  listAdminQuestionLaws,
  listAdminQuestions,
  previewAnkiImport,
  previewApkgImport,
  importApkg,
  importAnkiTxt,
  updateAdminQuestion,
  updateQuickAdminQuestion,
  updateStructureNode,
} from "@/lib/admin-questoes-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store, max-age=0" };

function failure(error: unknown) {
  if (error instanceof AdminQuestoesError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  console.error("Falha interna na administração de questões.");
  return NextResponse.json({ error: "Não foi possível concluir a operação de questões." }, { status: 500, headers });
}

export async function GET(request: Request) {
  try {
    const lawSlug = new URL(request.url).searchParams.get("law_slug");
    const data = lawSlug ? await listAdminQuestions(lawSlug) : { laws: await listAdminQuestionLaws() };
    return NextResponse.json(data, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const action = form.get("action");
      if (action !== "previsualizar_apkg" && action !== "importar_apkg") throw new AdminQuestoesError(400, "Ação de questões inválida.");
      const file = form.get("file");
      if (!(file instanceof File)) throw new AdminQuestoesError(400, "Arquivo APKG ausente.");
      const data = action === "previsualizar_apkg" ? await previewApkgImport(form.get("law_slug"), file) : await importApkg({ lawSlug: form.get("law_slug"), file });
      return NextResponse.json(data, { headers });
    }
    const body = await request.json() as Record<string, unknown>;
    let data: unknown;
    if (body.action === "criar") data = await createAdminQuestion(body);
    else if (body.action === "atualizar") data = await updateAdminQuestion(body);
    else if (body.action === "atualizar_rapido") data = await updateQuickAdminQuestion(body);
    else if (body.action === "desativar") data = await deactivateAdminQuestion(body);
    else if (body.action === "criar_estrutura") data = await createStructureNode(body);
    else if (body.action === "atualizar_estrutura") data = await updateStructureNode(body);
    else if (body.action === "desativar_estrutura") data = await deactivateStructureNode(body);
    else if (body.action === "excluir_estrutura") data = await deleteStructureNode(body);
    else if (body.action === "resumo_exclusao_estrutura") data = await structureDeletionSummary(body);
    else if (body.action === "previsualizar_anki") data = await previewAnkiImport(body);
    else if (body.action === "importar_anki") data = await importAnkiTxt(body);
    else throw new AdminQuestoesError(400, "Ação de questões inválida.");
    return NextResponse.json(data, { headers });
  } catch (error) {
    return failure(error);
  }
}
