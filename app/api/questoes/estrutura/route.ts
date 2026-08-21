import { loadStudentLaws, studentLawsErrorResponse } from "@/lib/student-laws-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requestedSlug = new URL(request.url).searchParams.get("slug")?.trim();
    const allStudentLaws = await loadStudentLaws(request);
    const laws = requestedSlug ? allStudentLaws.filter((law) => law.slug === requestedSlug) : allStudentLaws;
    if (!laws.length) return Response.json({ laws: [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const ids = laws.map((law) => law.id);
    const supabase = getSupabaseServerClient();
    const [questionsResult, structureResult] = await Promise.all([
      supabase.from("questions").select("id,lei_id,ordem,titulo,capitulo,secao,subsecao,assunto,structure_id").in("lei_id", ids).eq("ativo", true).order("ordem"),
      supabase.from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem").in("lei_id", ids).eq("ativo", true).order("ordem"),
    ]);
    if (questionsResult.error || structureResult.error) throw questionsResult.error ?? structureResult.error;
    return Response.json({ laws: laws.map((law) => ({
      ...law,
      questionsAvailable: (questionsResult.data ?? []).some((question) => question.lei_id === law.id),
      questions: (questionsResult.data ?? []).filter((question) => question.lei_id === law.id),
      structure: (structureResult.data ?? []).filter((node) => node.lei_id === law.id),
    })) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) { return studentLawsErrorResponse(error); }
}
