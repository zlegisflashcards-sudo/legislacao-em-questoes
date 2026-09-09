import { loadRecordsRanking } from "@/lib/records-ranking-server";
import { studentIdFromLeagueRequest } from "@/lib/league-ranking-server";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const data = await loadRecordsRanking((await context.params).slug, await studentIdFromLeagueRequest(request));
    return data ? Response.json(data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } }) : Response.json({ message: "Concurso não encontrado." }, { status: 404 });
  } catch (error) {
    console.error("Falha ao carregar ranking de Records", error instanceof Error ? error.message : "erro desconhecido");
    return Response.json({ message: "Não foi possível carregar o ranking agora." }, { status: 500 });
  }
}
