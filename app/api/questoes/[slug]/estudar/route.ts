import { lawStudyErrorResponse } from "@/lib/law-study-server";
import { authorizeLawQuestionScope } from "@/lib/law-question-scope-auth";
import { mainLawBySlug, mainStructure } from "@/lib/questions-main-server";
import { resolveQuestionsForLawScope } from "@/lib/law-question-scopes";

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
    const recorteId = url.searchParams.get("recorte_id");
    if (recorteId !== null && !/^[0-9a-f-]{36}$/i.test(recorteId)) {
      return Response.json({ success: false, message: "Recorte de lei inválido." }, { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }
    const authorization = await authorizeLawQuestionScope(request, slug, recorteId);
    let ids: number[] | undefined;
    if (Number.isSafeInteger(structureId) && structureId > 0) {
      ids = await descendantStructureIds(law.id, structureId);
    }
    const filters: Record<string, string> = {};
    for (const filter of ALLOWED_FILTERS) {
      const value = url.searchParams.get(filter)?.trim();
      if (value) filters[filter] = value;
    }
    // Um recorte é sempre um subconjunto estrutural da mesma lei autorizada.
    // Filtros livres continuam sendo aplicados sem criar uma segunda fonte.
    const [scopeQuestions, structure] = await Promise.all([resolveQuestionsForLawScope(law.id, recorteId), mainStructure(law.id)]);
    const questions = (ids?.length ? scopeQuestions.filter((question) => question.structure_id !== null && ids!.includes(question.structure_id)) : scopeQuestions)
      .filter((question) => Object.entries(filters).every(([field, value]) => question[field as keyof typeof question] === value));

    return Response.json(
      {
        success: true,
        law,
        recorte: authorization.recorte,
        filters,
        structure,
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
