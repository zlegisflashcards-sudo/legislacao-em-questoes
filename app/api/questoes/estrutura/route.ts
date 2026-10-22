import { loadStudentLaws, studentLawsErrorResponse } from "@/lib/student-laws-server";
import { uniqueStudentLawsById } from "@/lib/student-laws";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { collectPages } from "@/lib/law-question-pagination";

export const dynamic = "force-dynamic";
const STRUCTURE_PAGE_SIZE = 500;

export async function GET(request: Request) {
  try {
    const requestedSlug = new URL(request.url).searchParams.get("slug")?.trim();
    const allStudentLaws = uniqueStudentLawsById(await loadStudentLaws(request));
    const laws = requestedSlug ? allStudentLaws.filter((law) => law.slug === requestedSlug) : allStudentLaws;
    if (!laws.length) return Response.json({ laws: [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    const ids = laws.map((law) => law.id);
    const supabase = getSupabaseServerClient();
    const [questions, structure] = await Promise.all([
      collectPages(async (from, to) => {
        const result = await supabase.from("questions").select("id,lei_id,ordem,titulo,capitulo,secao,subsecao,assunto,structure_id").in("lei_id", ids).eq("ativo", true).order("ordem").order("created_at").order("id").range(from, to);
        if (result.error) throw result.error;
        return result.data ?? [];
      }, STRUCTURE_PAGE_SIZE),
      collectPages(async (from, to) => {
        const result = await supabase.from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem").in("lei_id", ids).eq("ativo", true).order("ordem").order("id").range(from, to);
        if (result.error) throw result.error;
        return result.data ?? [];
      }, STRUCTURE_PAGE_SIZE),
    ]);
    return Response.json({ laws: laws.map((law) => ({
      ...law,
      questionsAvailable: questions.some((question) => question.lei_id === law.id),
      questions: questions.filter((question) => question.lei_id === law.id),
      structure: structure.filter((node) => node.lei_id === law.id),
    })) }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) { return studentLawsErrorResponse(error); }
}
