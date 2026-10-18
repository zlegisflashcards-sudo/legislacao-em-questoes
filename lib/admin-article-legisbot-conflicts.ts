import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { parseQuestionOrder } from "@/lib/question-structure-consistency";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ArticleLegisBotConflictKind = "estrutura" | "duplicata" | "falha_tecnica" | "granularidade";
export type ArticleLegisBotConflict = { kind: ArticleLegisBotConflictKind; ordem: string; title: string; detail: string; legisbotId: number | null; referenceId: string | null; informational: boolean };

type Reference = { id: string; ordem: string; identificacao: string };
type Bot = { id: number; ordem: string; titulo: string; status: string; last_error_category: string | null };

async function pages<T>(request: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await request(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

/** Issues belonging to the Article/LegisBot layer only. Question editorial conflicts stay in Central da Lei. */
export async function listArticleLegisBotConflicts(rawSlug: string) {
  await exigirAdministrador();
  const slug = rawSlug.trim().toLowerCase();
  if (!slug) return [] as ArticleLegisBotConflict[];
  const db = getSupabaseServerClient();
  const [references, bots] = await Promise.all([
    pages<Reference>((from, to) => db.from("legislative_references").select("id,ordem,identificacao").eq("slug", slug).order("ordem").range(from, to)),
    pages<Bot>((from, to) => db.from("legisbot_comentarios").select("id,ordem,titulo,status,last_error_category").eq("slug", slug.toUpperCase()).order("ordem").order("id").range(from, to)),
  ]);
  const referenceByOrder = new Map(references.map((reference) => [reference.ordem, reference]));
  const conflicts: ArticleLegisBotConflict[] = [];
  for (const reference of references) {
    const parsed = parseQuestionOrder(reference.ordem);
    if (!parsed) conflicts.push({ kind: "estrutura", ordem: reference.ordem, title: reference.identificacao, detail: "A Ordem da referência não segue o padrão estrutural oficial. Revise sem alterar questões automaticamente.", legisbotId: null, referenceId: reference.id, informational: false });
    else if (parsed.inciso || parsed.letraInciso) conflicts.push({ kind: "granularidade", ordem: reference.ordem, title: reference.identificacao, detail: "Exceção de granularidade: este bloco alcança inciso ou alínea. É apenas uma etiqueta editorial.", legisbotId: null, referenceId: reference.id, informational: true });
  }
  const botsByOrder = new Map<string, Bot[]>();
  for (const bot of bots) botsByOrder.set(bot.ordem, [...(botsByOrder.get(bot.ordem) ?? []), bot]);
  for (const [ordem, siblings] of botsByOrder) {
    if (siblings.length > 1) conflicts.push({ kind: "duplicata", ordem, title: siblings[0].titulo || `Ordem ${ordem}`, detail: `${siblings.length} registros do LegisBot usam a mesma Ordem. Revise antes de remover ou mesclar qualquer conteúdo.`, legisbotId: siblings[0].id, referenceId: referenceByOrder.get(ordem)?.id ?? null, informational: false });
    for (const bot of siblings) {
      if (!referenceByOrder.has(ordem)) conflicts.push({ kind: "estrutura", ordem, title: bot.titulo || `LegisBot #${bot.id}`, detail: "Este LegisBot não possui referência legislativa exata na base. A ausência de LegisBot nunca é conflito; o inverso precisa de revisão.", legisbotId: bot.id, referenceId: null, informational: false });
      if (bot.status === "erro") conflicts.push({ kind: "falha_tecnica", ordem, title: bot.titulo || `LegisBot #${bot.id}`, detail: bot.last_error_category ? `A última geração falhou: ${bot.last_error_category}.` : "A última geração falhou; tente gerar novamente ou revise a configuração.", legisbotId: bot.id, referenceId: referenceByOrder.get(ordem)?.id ?? null, informational: false });
    }
  }
  return conflicts.sort((left, right) => left.ordem.localeCompare(right.ordem) || left.kind.localeCompare(right.kind));
}
