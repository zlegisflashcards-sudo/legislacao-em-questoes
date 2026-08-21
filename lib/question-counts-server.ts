import "server-only";

import { supabaseQuestoes } from "@/lib/supabase-questoes-server";
import { unifiedActiveQuestionCount, unifiedLawBySlug, usesUnifiedStagingQuestions } from "@/lib/unified-questions-staging-server";

/** Fonte única de contagem: somente registros ativos da tabela de questões da fonte explícita da lei. */
export async function activeQuestionCountsBySlug(slugs: string[]) {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  const counts = new Map(unique.map((slug) => [slug, 0]));
  const unified = unique.filter(usesUnifiedStagingQuestions);
  const legacy = unique.filter((slug) => !usesUnifiedStagingQuestions(slug));

  await Promise.all(unified.map(async (slug) => {
    const law = await unifiedLawBySlug(slug);
    if (law) counts.set(slug, await unifiedActiveQuestionCount(Number(law.id)));
  }));

  if (legacy.length) {
    const { data: laws, error } = await supabaseQuestoes
      .from("laws")
      .select("id,slug")
      .in("slug", legacy)
      .eq("ativo", true);
    if (error) throw new Error("Não foi possível contar as questões ativas.");

    await Promise.all((laws ?? []).map(async (law) => {
      const { count, error: countError } = await supabaseQuestoes
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("law_id", law.id)
        .eq("ativo", true);
      if (countError) throw new Error("Não foi possível contar as questões ativas.");
      counts.set(law.slug, count ?? 0);
    }));
  }

  return counts;
}

export async function activeQuestionCountBySlug(slug: string) {
  return (await activeQuestionCountsBySlug([slug])).get(slug) ?? 0;
}
