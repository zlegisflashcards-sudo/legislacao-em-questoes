import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { importLegislativeDocument, previewLegislativeDocumentImport } from "@/lib/admin-legislative-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
    const form = await request.formData();
    const action = String(form.get("action") ?? "");
    const lawSlug = String(form.get("law") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Selecione um documento DOCX, TXT ou Markdown." }, { status: 400, headers });
    if (file.size > 2_000_000) return NextResponse.json({ error: "O documento pode ter no máximo 2 MB." }, { status: 413, headers });
    const input = { lawSlug, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    if (action === "preview") return NextResponse.json(await previewLegislativeDocumentImport(input), { headers });
    if (action === "apply") return NextResponse.json(await importLegislativeDocument({ ...input, expected: JSON.parse(String(form.get("expected") ?? "[]")) }), { headers });
    return NextResponse.json({ error: "Ação de importação inválida." }, { status: 400, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível importar o documento." }, { status: 400, headers });
  }
}
