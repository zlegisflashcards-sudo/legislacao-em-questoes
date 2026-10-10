import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { articleUpdateOverview, concludeArticleLegislativeUpdate, createArticleLegislativeUpdate, saveIntentionalCombination, setArticleLegislativeUpdateStep } from "@/lib/admin-article-legislative-updates";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
const error = (value: unknown) => NextResponse.json({ error: value instanceof Error ? value.message : "Não foi possível salvar a atualização." }, { status: 400, headers });

export async function GET(request: Request) {
  try { if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers }); const url = new URL(request.url); return NextResponse.json(await articleUpdateOverview(url.searchParams.get("slug") ?? "", url.searchParams.get("ordem") ?? ""), { headers }); } catch (caught) { return error(caught); }
}
export async function POST(request: Request) {
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "salvar_combinacao") return NextResponse.json(await saveIntentionalCombination({ slug: String(body.slug ?? ""), ordem: String(body.ordem ?? ""), questionId: String(body.question_id ?? ""), supports: body.supports, justification: body.justification }), { headers });
    if (body.action === "marcar_atualizacao") return NextResponse.json(await createArticleLegislativeUpdate({ slug: String(body.slug ?? ""), ordem: String(body.ordem ?? ""), observation: body.observation }), { headers });
    if (body.action === "etapa_atualizacao") return NextResponse.json(await setArticleLegislativeUpdateStep({ updateId: String(body.update_id ?? ""), step: body.step, completed: body.completed }), { headers });
    if (body.action === "concluir_atualizacao") return NextResponse.json(await concludeArticleLegislativeUpdate({ updateId: String(body.update_id ?? ""), publicNote: body.public_note }), { headers });
    return NextResponse.json({ error: "Ação inválida." }, { status: 400, headers });
  } catch (caught) { return error(caught); }
}
