import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/legisbot-community-server";
import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const REFERENCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tokenFrom(request: NextRequest) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const requested = [...new Set((request.nextUrl.searchParams.get("reference_ids") ?? "").split(",").filter((id) => REFERENCE_ID.test(id)))].slice(0, 30);
  if (!/^[a-z0-9_-]{1,50}$/.test(slug) || !requested.length) return NextResponse.json({ success: true, highlights: [] });
  try {
    await requireRequestUser(request);
    // Confere a lei no servidor e consulta os destaques em lote pelo cliente
    // do aluno; RLS continua sendo a autoridade para a propriedade dos dados.
    const references = await getSupabaseServerClient().from("legislative_references").select("id").eq("slug", slug).in("id", requested);
    if (references.error) throw references.error;
    const ids = (references.data ?? []).map((row) => String(row.id));
    if (!ids.length) return NextResponse.json({ success: true, highlights: [] });
    const result = await createSupabaseUserClient(tokenFrom(request))
      .from("legisbot_destaques_usuario")
      .select("id,reference_id,inicio,fim,trecho,cor,created_at,updated_at")
      .in("reference_id", ids)
      .order("inicio", { ascending: true });
    if (result.error) throw result.error;
    return NextResponse.json({ success: true, highlights: (result.data ?? []).map((row) => ({
      referenceId: String(row.reference_id), id: String(row.id), start: Number(row.inicio), end: Number(row.fim), text: String(row.trecho), color: String(row.cor), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })) });
  } catch {
    return NextResponse.json({ success: false, message: "Não foi possível carregar seus destaques." }, { status: 500 });
  }
}
