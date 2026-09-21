import { authorizeLawStudy, lawStudyErrorResponse } from "@/lib/law-study-server";
import { newQuestionCountsByStructure } from "@/lib/law-new-questions";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const context = await authorizeLawStudy(request, slug);
    const { data: campaigns, error: campaignsError } = await context.supabase.from("campanhas_leis_alunos").select("id").eq("aluno_id", context.studentId).eq("lei_id", context.lawId);
    if (campaignsError) throw new Error(campaignsError.message);
    const campaignIds = (campaigns ?? []).map((campaign) => campaign.id);
    const [questions, structure, answers] = await Promise.all([
      context.supabase.from("questions").select("id,structure_id,created_at").eq("lei_id", context.lawId).eq("ativo", true),
      context.supabase.from("law_structure").select("id,parent_id").eq("lei_id", context.lawId).eq("ativo", true),
      campaignIds.length ? context.supabase.from("campanhas_leis_respostas").select("questao_id,respondido_em").in("campanha_id", campaignIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (questions.error || structure.error || answers.error) throw new Error(questions.error?.message ?? structure.error?.message ?? answers.error?.message);
    const counts = newQuestionCountsByStructure(
      (structure.data ?? []).map((node) => ({ id: node.id, parentId: node.parent_id })),
      (questions.data ?? []).flatMap((question) => typeof question.created_at === "string" ? [{ id: question.id, structureId: question.structure_id, createdAt: question.created_at }] : []),
      (answers.data ?? []).flatMap((answer) => typeof answer.questao_id === "string" && typeof answer.respondido_em === "string" ? [{ questionId: answer.questao_id, answeredAt: answer.respondido_em }] : []),
    );
    return Response.json({ counts: Object.fromEntries(counts) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) { return lawStudyErrorResponse(error); }
}
