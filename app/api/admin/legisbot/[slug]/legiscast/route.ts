import { NextRequest, NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getLegiscastAudioForLaw } from "@/lib/legiscast-audios-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Prévia administrativa: não altera a autorização comercial da rota pública. */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const administrator = await obterAdministrador();
  if (!administrator) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "private, no-store, max-age=0" } });

  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const law = await getSupabaseServerClient().from("leis").select("id").eq("slug", slug).maybeSingle();
  if (law.error) return NextResponse.json({ error: "Não foi possível consultar a legislação." }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  if (!law.data) return NextResponse.json({ error: "Legislação não encontrada." }, { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } });

  try {
    const result = await getLegiscastAudioForLaw(Number(law.data.id), request.nextUrl.searchParams.get("structure_id"));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível preparar o áudio desta estrutura.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
