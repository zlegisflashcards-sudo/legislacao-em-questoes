import { authorizeLawStudy, lawStudyErrorResponse } from "@/lib/law-study-server";
import { supabaseQuestoes } from "@/lib/supabase-questoes-server";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

const ALLOWED_FILTERS = [
  "titulo",
  "capitulo",
  "secao",
  "subsecao",
] as const;

async function descendantStructureIds(lawId: number, rootId: number) {
  const { data, error } = await supabaseQuestoes.from("law_structure").select("id,parent_id").eq("law_id", lawId).eq("ativo", true);
  if (error) throw error;
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) { changed = false; for (const node of data ?? []) if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) { ids.add(node.id); changed = true; } }
  return [...ids];
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;

    // Autoriza o acesso usando o banco principal.
    await authorizeLawStudy(request, slug);

    const { data: law, error: lawError } = await supabaseQuestoes
      .from("laws")
      .select("id, slug, titulo, nome_curto")
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();

    if (lawError) {
      throw lawError;
    }

    if (!law) {
      return Response.json(
        {
          success: false,
          message: "Esta lei ainda não possui questões disponíveis.",
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      );
    }

    const url = new URL(request.url);

    let query = supabaseQuestoes
      .from("questions")
      .select(`
        id,
        pergunta,
        resposta,
        justificativa,
        assunto,
        legislacao,
        ordem,
        titulo,
        capitulo,
        secao,
        subsecao,
        artigo,
        structure_id
      `)
      .eq("law_id", law.id)
      .eq("ativo", true);

    const structureId = Number(url.searchParams.get("structure_id"));
    if (Number.isSafeInteger(structureId) && structureId > 0) {
      const ids = await descendantStructureIds(law.id, structureId);
      query = query.in("structure_id", ids);
    }
    for (const filter of ALLOWED_FILTERS) {
      const value = url.searchParams.get(filter)?.trim();

      if (value) {
        query = query.eq(filter, value);
      }
    }

    const { data: questions, error: questionsError } =
      await query.order("ordem", { ascending: true });

    if (questionsError) {
      throw questionsError;
    }

    return Response.json(
      {
        success: true,
        law,
        filters: Object.fromEntries(
          ALLOWED_FILTERS.flatMap((filter) => {
            const value = url.searchParams.get(filter)?.trim();
            return value ? [[filter, value]] : [];
          })
        ),
        questions: questions ?? [],
        total: questions?.length ?? 0,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
