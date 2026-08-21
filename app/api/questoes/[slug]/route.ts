import { mainLawBySlug, mainQuestions } from "@/lib/questions-main-server";
import {
  authorizeLawStudy,
  lawStudyErrorResponse,
} from "@/lib/law-study-server";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;

    // 1. Autoriza no banco principal.
    // Confirma sessão, aluno e liberação ativa da lei.
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

    const questions = await mainQuestions(law.id);

    return Response.json(
      {
        success: true,
        law,
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
