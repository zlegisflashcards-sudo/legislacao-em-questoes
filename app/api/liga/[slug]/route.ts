import { loadLeagueRanking, studentIdFromLeagueRequest } from "@/lib/league-ranking-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const slug = (await context.params).slug;
    const data = await loadLeagueRanking(slug, await studentIdFromLeagueRequest(request));
    return data ? Response.json(data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } }) : Response.json({ message: "Liga não encontrada." }, { status: 404 });
  } catch (error) {
    console.error("Falha ao carregar liga", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json({ message: "Não foi possível carregar a Liga agora." }, { status: 500 });
  }
}
