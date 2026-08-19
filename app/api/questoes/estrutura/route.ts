import { loadStudentLaws, studentLawsErrorResponse } from "@/lib/student-laws-server";
import { supabaseQuestoes } from "@/lib/supabase-questoes-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Leis que o aluno realmente possui no banco principal.
    const studentLaws = await loadStudentLaws(request);

    if (studentLaws.length === 0) {
      return Response.json(
        {
          laws: [],
        },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      );
    }

    const allowedSlugs = studentLaws.map((law) => law.slug);

    // Identifica essas mesmas leis no banco de questões.
    const { data: questionLaws, error: lawsError } =
      await supabaseQuestoes
        .from("laws")
        .select("id, slug")
        .in("slug", allowedSlugs)
        .eq("ativo", true);

    if (lawsError) {
      throw lawsError;
    }

    if (!questionLaws || questionLaws.length === 0) {
      return Response.json(
        {
          laws: studentLaws.map((law) => ({
            ...law,
            questionsAvailable: false,
            questions: [],
          })),
        },
        {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
          },
        }
      );
    }

    const questionLawIds = questionLaws.map((law) => law.id);

    // IMPORTANTE:
    // Para a tela inicial não precisamos enviar pergunta,
    // resposta, justificativa ou legislação.
    // Apenas os campos necessários para construir a árvore.
    const { data: questions, error: questionsError } =
      await supabaseQuestoes
        .from("questions")
        .select(`
          id,
          law_id,
          ordem,
          titulo,
          capitulo,
          secao,
          subsecao,
          assunto,
          structure_id
        `)
        .in("law_id", questionLawIds)
        .eq("ativo", true)
        .order("ordem", { ascending: true });

    if (questionsError) {
      throw questionsError;
    }

    const { data: structure, error: structureError } = await supabaseQuestoes.from("law_structure").select("id,law_id,parent_id,tipo,nome,ordem").in("law_id", questionLawIds).eq("ativo", true).order("ordem", { ascending: true });
    if (structureError) throw structureError;
    const questionLawBySlug = new Map(
      questionLaws.map((law) => [law.slug, law.id])
    );

    const response = studentLaws.map((law) => {
      const questionLawId = questionLawBySlug.get(law.slug);

      const lawQuestions = questionLawId
        ? (questions ?? []).filter(
            (question) => question.law_id === questionLawId
          )
        : [];

      return {
        ...law,
        questionsAvailable: Boolean(questionLawId),
        questions: lawQuestions,
        structure: (structure ?? []).filter((node) => node.law_id === questionLawId),
      };
    });

    return Response.json(
      {
        laws: response,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return studentLawsErrorResponse(error);
  }
}
