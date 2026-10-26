import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { parseQuestionPatch, QUESTION_PATCH_MAX_BYTES } from "@/lib/question-uuid-patch";
import { buildQuestionPatchPreview, type PatchQuestion } from "@/lib/question-uuid-patch-preview";
import { createQuestionPatchConfirmation, questionPatchSnapshotHash, verifyQuestionPatchConfirmation } from "@/lib/question-uuid-patch-confirmation";

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
    const admin = await obterAdministrador();
    if (!admin) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
    let body: { law_slug?: unknown; patch?: unknown; action?: unknown; confirmation?: unknown };
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
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret || secret.length < 32) return NextResponse.json({ error: "Configuração de confirmação indisponível." }, { status: 503, headers });
    const lawId = Number(law.data.id);
    let confirmation: ReturnType<typeof verifyQuestionPatchConfirmation> | null = null;
    if (body.action === "apply" || body.action === "status") {
      if (body.action === "apply" && process.env.QUESTION_UUID_PATCH_APPLY_ENABLED !== "true") return NextResponse.json({ error: "Aplicação desativada até a revisão da migration e dos testes transacionais." }, { status: 503, headers });
      try { confirmation = verifyQuestionPatchConfirmation(String(body.confirmation ?? ""), { actorId: admin.id, lawId, patch, raw: body.patch, secret, now: Date.now(), allowExpired: body.action === "status" }); }
      catch { return NextResponse.json({ error: "Confirmação inválida, expirada ou incompatível. Gere nova prévia." }, { status: 409, headers }); }
    } else if (body.action !== undefined && body.action !== "preview") return NextResponse.json({ error: "Ação inválida." }, { status: 400, headers });
    const rows: PatchQuestion[] = [];
    const ids = patch.updates.map((item) => item.uuid);
    for (let start = 0; start < ids.length; start += 200) {
      const result = await db.from("questions").select("id,lei_id,ativo,assunto,ordem,updated_at").eq("lei_id", law.data.id).in("id", ids.slice(start, start + 200));
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []) as PatchQuestion[]);
    }
    const preview = buildQuestionPatchPreview(patch, lawId, rows);
    if (!confirmation) {
      const token = preview.counts.conflitos === 0 && preview.counts.aptos > 0 ? createQuestionPatchConfirmation({ actorId: admin.id, lawId, patch, raw: body.patch, rows, secret, now: Date.now() }) : null;
      return NextResponse.json({ ...preview, confirmation: token, apply_available: process.env.QUESTION_UUID_PATCH_APPLY_ENABLED === "true" }, { headers });
    }
    const previous = await db.from("admin_question_uuid_patch_operations").select("actor_id,law_id,patch_hash,result").eq("operation_id", confirmation.operationId).maybeSingle();
    if (previous.error) return NextResponse.json({ error: "Aplicação indisponível: a operação transacional ainda não está instalada no banco." }, { status: 503, headers });
    let result = previous.data?.result;
    if (previous.data && (previous.data.actor_id !== admin.id || Number(previous.data.law_id) !== lawId || previous.data.patch_hash !== confirmation.patchHash)) return NextResponse.json({ error: "Operação incompatível." }, { status: 403, headers });
    if (!previous.data && body.action === "status") return NextResponse.json({ error: "Nenhuma operação concluída foi encontrada para esta prévia. Aguarde e consulte novamente antes de reanalisar." }, { status: 404, headers });
    if (!previous.data) {
      if (questionPatchSnapshotHash(rows) !== confirmation.snapshotHash || preview.counts.conflitos) return NextResponse.json({ error: "As questões mudaram desde a prévia. Gere uma nova análise." }, { status: 409, headers });
      const applied = await db.rpc("admin_apply_question_uuid_patch", { p_operation_id: confirmation.operationId, p_actor_id: admin.id, p_law_id: lawId, p_patch_hash: confirmation.patchHash, p_updates: patch.updates, p_snapshot: rows });
      if (applied.error) return NextResponse.json({ error: applied.error.code === "40001" ? "As questões mudaram desde a prévia. Gere uma nova análise." : "Não foi possível confirmar a aplicação. Reanalise ou consulte o resultado da operação." }, { status: applied.error.code === "40001" ? 409 : 503, headers });
      result = applied.data;
    }
    const verifiedRows: PatchQuestion[] = [];
    for (let start = 0; start < ids.length; start += 200) {
      const current = await db.from("questions").select("id,lei_id,ativo,assunto,ordem,updated_at").eq("lei_id", lawId).in("id", ids.slice(start, start + 200));
      if (current.error) return NextResponse.json({ result, verified: false, message: "Operação registrada, mas a verificação final falhou. Consulte novamente." }, { headers });
      verifiedRows.push(...(current.data ?? []) as PatchQuestion[]);
    }
    const verification = buildQuestionPatchPreview(patch, lawId, verifiedRows);
    const verified = verification.counts.ja_aplicados === patch.updates.length;
    return NextResponse.json({ result, verified, message: verified ? "Correções aplicadas e verificadas." : "Operação registrada, mas os valores atuais não puderam ser confirmados." }, { headers });
  } catch {
    return NextResponse.json({ error: "Não foi possível analisar o arquivo." }, { status: 500, headers });
  }
}
