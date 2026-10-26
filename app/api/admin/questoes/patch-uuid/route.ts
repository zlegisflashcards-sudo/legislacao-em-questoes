import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { parseQuestionPatch, QUESTION_PATCH_MAX_BYTES } from "@/lib/question-uuid-patch";
import { buildQuestionPatchPreview, type PatchQuestion } from "@/lib/question-uuid-patch-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function boundedBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Corpo ausente.");
  const limit = QUESTION_PATCH_MAX_BYTES * 6 + 4096;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let raw = ""; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new Error("Arquivo excede o limite."); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return JSON.parse(raw);
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
    let body: { law_slug?: unknown; patch?: unknown };
    try { body = await boundedBody(request) as typeof body; } catch { return NextResponse.json({ error: "Requisição inválida ou excede o limite." }, { status: 400, headers }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Requisição inválida." }, { status: 400, headers });
    if (typeof body.patch !== "string" || new TextEncoder().encode(body.patch).length > QUESTION_PATCH_MAX_BYTES) return NextResponse.json({ error: "Arquivo inválido ou acima do limite de 2 MiB." }, { status: 400, headers });
    let patch;
    try { patch = parseQuestionPatch(body.patch); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Patch inválido." }, { status: 400, headers }); }
    if (patch.law_slug !== body.law_slug) return NextResponse.json({ error: "A lei do arquivo não corresponde à lei selecionada." }, { status: 400, headers });
    const db = getSupabaseServerClient();
    const law = await db.from("leis").select("id,slug").eq("slug", patch.law_slug).eq("ativo", true).maybeSingle();
    if (law.error) throw law.error;
    if (!law.data) return NextResponse.json({ error: "Lei ativa não encontrada." }, { status: 404, headers });
    const rows: PatchQuestion[] = [];
    const ids = patch.updates.map((item) => item.uuid);
    for (let start = 0; start < ids.length; start += 200) {
      const result = await db.from("questions").select("id,lei_id,ativo,assunto,ordem,updated_at").eq("lei_id", law.data.id).in("id", ids.slice(start, start + 200));
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []) as PatchQuestion[]);
    }
    return NextResponse.json(buildQuestionPatchPreview(patch, Number(law.data.id), rows), { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível analisar o arquivo." }, { status: 500, headers });
  }
}
