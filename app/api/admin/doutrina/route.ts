import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { buildDoctrinePersistencePlan } from "@/lib/doctrine-persistence-plan";
import { doctrineRowsFromTransfer, type DoctrineTransferPayload } from "@/lib/doctrine-import-contract";
import { buildDoctrineApkg } from "@/lib/doctrine-apkg-export";
import { DoctrineRpcImportError, importDoctrineViaRpc } from "@/lib/doctrine-rpc-import";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store, max-age=0" };

// Import is not a client-side write: POST resolves the admin session and then
// delegates the whole plan to the post-migration transactional RPC.

/**
 * Authenticated administrative preview and, after the draft migration is
 * explicitly applied, the transaction-backed import endpoint.
 */
export async function POST(request: Request) {
  const administrator = await obterAdministrador();
  if (!administrator) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
  try {
    const body = await request.json() as { action?: unknown; payload?: DoctrineTransferPayload; slug?: unknown; ordem?: unknown };
    if (body.action !== "previsualizar" && body.action !== "gerar_apkg" && body.action !== "importar") {
      return NextResponse.json({ error: "Importação de doutrina permanece bloqueada até a migration transacional aprovada." }, { status: 503, headers });
    }
    if (!body.payload || typeof body.payload !== "object") return NextResponse.json({ error: "Arquivo de transferência de doutrina ausente." }, { status: 400, headers });
    const slug = typeof body.slug === "string" ? body.slug : undefined;
    if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "Slug de doutrina inválido." }, { status: 400, headers });
    const plan = buildDoctrinePersistencePlan(body.payload, slug);
    if (body.action === "gerar_apkg") {
      const exported = await buildDoctrineApkg({ slug: plan.slug, titulo: plan.titulo, notes: doctrineRowsFromTransfer(body.payload) });
      return new Response(Buffer.from(exported.bytes), { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${exported.filename}"` } });
    }
    if (body.action === "importar") {
      // The browser never supplies an actor. This identity was verified by
      // obterAdministrador() before the request payload was parsed.
      const ordem = typeof body.ordem === "number" ? body.ordem : Number(body.ordem);
      const imported = await importDoctrineViaRpc(getSupabaseServerClient(), {
        administratorUserId: administrator.id,
        ordem,
        plan,
      });
      return NextResponse.json({ imported }, { headers });
    }
    return NextResponse.json({ preview: { slug: plan.slug, titulo: plan.titulo, tipoConteudo: plan.tipoConteudo, questions: plan.questions.length, topics: new Set(plan.questions.map((question) => question.ordem)).size, structures: plan.structures } }, { headers });
  } catch (error) {
    if (error instanceof DoctrineRpcImportError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Prévia de doutrina inválida." }, { status: 422, headers });
  }
}
