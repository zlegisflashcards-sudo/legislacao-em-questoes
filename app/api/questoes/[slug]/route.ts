import { supabaseQuestoes } from "@/lib/supabase-questoes-server";
import { unifiedLawBySlug, unifiedQuestions, usesUnifiedStagingQuestions } from "@/lib/unified-questions-staging-server";
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

    if (usesUnifiedStagingQuestions(slug)) {
      const law = await unifiedLawBySlug(slug);
      if (!law) return Response.json({ success: false, message: "Esta lei ainda não possui questões disponíveis." }, { status: 404 });
      const questions = await unifiedQuestions(Number(law.id));
      console.info("questoes_source=main", { slug });
      return Response.json({ success: true, law, questions, total: questions.length }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    // 2. Só depois consulta o banco separado de questões.
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

    // 3. Carrega as questões da lei no segundo Supabase.
    const { data: questions, error: questionsError } =
      await supabaseQuestoes
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
          total_artigos,
          slug,
          ultima_alteracao_legislativa,
          capitulo,
          secao,
          subsecao,
          artigo
        `)
        .eq("law_id", law.id)
        .eq("ativo", true)
        .order("ordem", { ascending: true });

    if (questionsError) {
      throw questionsError;
    }

    return Response.json(
      {
        success: true,
        law,
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
