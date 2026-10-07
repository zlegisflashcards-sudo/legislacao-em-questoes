import { NextResponse } from "next/server";

import { obterAdministrador } from "@/lib/admin-auth";
import { applyMappingImport, exportArticleMappings, type MappingInput, previewMappingImport, saveArticleMapping } from "@/lib/admin-article-mappings";

export const runtime = "nodejs";

const input = (value: unknown): MappingInput => {
  const row = value as Record<string, unknown>;
  return {
    slug: String(row.slug ?? ""),
    ordem: String(row.ordem ?? ""),
    incidencia: typeof row.incidencia === "string" ? row.incidencia : undefined,
    artigo_recente: row.artigo_recente === true || row.artigo_recente === "true",
    origem_mapeamento: typeof row.origem_mapeamento === "string" ? row.origem_mapeamento : null,
    observacao_interna: typeof row.observacao_interna === "string" ? row.observacao_interna : null,
    confianca: typeof row.confianca === "number" ? row.confianca : typeof row.confianca === "string" && row.confianca.trim() ? Number(row.confianca) : null,
  };
};

export async function GET(request: Request) {
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401 });
    const slug = new URL(request.url).searchParams.get("lei") ?? "";
    return NextResponse.json(await exportArticleMappings(slug));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha na exportação." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const rows = Array.isArray(body.rows) ? body.rows.map(input) : [];
    if (body.action === "salvar") return NextResponse.json(await saveArticleMapping(input(body)));
    if (body.action === "previsualizar_importacao") return NextResponse.json(await previewMappingImport(rows));
    if (body.action === "aplicar_importacao") return NextResponse.json(await applyMappingImport(rows, String(body.confirmation ?? "")));
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o mapeamento." }, { status: 400 });
  }
}
