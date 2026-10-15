import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { searchLegisBotsForQuestionLink, setQuestionLegisBotLink } from "@/lib/question-legisbot-links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401 });
  const url = new URL(request.url);
  try {
    return NextResponse.json(await searchLegisBotsForQuestionLink({
      slug: url.searchParams.get("slug") ?? "",
      query: url.searchParams.get("q") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível pesquisar os LegisBots." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401 });
  try {
    const body = await request.json() as { question_ids?: unknown; legisbot_id?: unknown };
    const questionIds = Array.isArray(body.question_ids) ? body.question_ids.filter((id): id is string => typeof id === "string") : [];
    const legisbotId = body.legisbot_id === null ? null : Number(body.legisbot_id);
    return NextResponse.json(await setQuestionLegisBotLink({ questionIds, legisbotId }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar os vínculos." }, { status: 400 });
  }
}
