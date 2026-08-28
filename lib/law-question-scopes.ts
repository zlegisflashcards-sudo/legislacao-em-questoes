import { getSupabaseServerClient } from "@/lib/supabase-server";
import { mainQuestions, mainStructure } from "@/lib/questions-main-server";
import { descendantsForScope, questionsInScope } from "@/lib/law-question-scope-resolution";

export { descendantsForScope, questionsInScope } from "@/lib/law-question-scope-resolution";

export async function resolveQuestionsForLawScope(leiId: number, recorteId: string | null) {
  if (!recorteId) return mainQuestions(leiId);
  const db = getSupabaseServerClient();
  const scope = await db.from("recortes_leis").select("id,lei_id").eq("id", recorteId).eq("lei_id", leiId).eq("ativo", true).maybeSingle();
  if (scope.error) throw new Error(`Não foi possível carregar o recorte: ${scope.error.message}`);
  if (!scope.data) throw new Error("Recorte de lei não encontrado ou indisponível.");
  const [links, nodes, questions] = await Promise.all([
    db.from("recortes_leis_estrutura").select("structure_id").eq("recorte_id", recorteId),
    mainStructure(leiId),
    mainQuestions(leiId),
  ]);
  if (links.error) throw new Error(`Não foi possível carregar as regras do recorte: ${links.error.message}`);
  const selected = (links.data ?? []).map((row) => Number(row.structure_id)).filter(Number.isSafeInteger);
  return questionsInScope(questions, descendantsForScope(nodes, selected));
}
