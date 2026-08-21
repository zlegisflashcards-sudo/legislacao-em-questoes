import { authorizeLawStudy, lawStudyErrorResponse } from "@/lib/law-study-server";
import { mainLawBySlug, mainQuestions, mainStructure } from "@/lib/questions-main-server";

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
  const data = await mainStructure(lawId);
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
    const law = await mainLawBySlug(slug);

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

    const structureId = Number(url.searchParams.get("structure_id"));
    let ids: number[] | undefined;
    if (Number.isSafeInteger(structureId) && structureId > 0) {
      ids = await descendantStructureIds(law.id, structureId);
    }
    const filters: Record<string, string> = {};
    for (const filter of ALLOWED_FILTERS) {
      const value = url.searchParams.get(filter)?.trim();
      if (value) filters[filter] = value;
    }
    const questions = await mainQuestions(law.id, { structureIds: ids, values: filters });

    return Response.json(
      {
        success: true,
        law,
        filters,
        questions,
        total: questions.length,
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
