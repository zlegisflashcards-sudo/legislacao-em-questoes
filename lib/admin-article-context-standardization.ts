import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { parseQuestionFieldChange } from "@/lib/admin-questoes";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { validateQuestionStructure } from "@/lib/question-structure-consistency";

export class ArticleContextStandardizationError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

type Changes = Partial<Record<"assunto" | "ordem" | "legislacao", string>>;
type GranularityDecision = "paragrafo_inteiro" | "recorte_inciso";
type ContextRow = { id: string; titulo: string | null; assunto: string | null; ordem: string; legislacao: string | null };
const validSlug = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{1,160}$/i.test(value.trim());
const validOrder = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9._-]{1,20}$/.test(value.trim());

function parse(body: Record<string, unknown>) {
  const lawSlug = String(body.law_slug ?? "").trim().toLowerCase();
  const slug = String(body.context_slug ?? "").trim().toLowerCase();
  const ordem = String(body.context_ordem ?? "").trim();
  if (!validSlug(lawSlug) || lawSlug !== slug || !validOrder(ordem)) throw new ArticleContextStandardizationError(400, "Contexto do artigo inválido.");
  const raw = body.changes;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ArticleContextStandardizationError(400, "Alterações inválidas.");
  const changes: Changes = {};
  for (const field of ["assunto", "ordem", "legislacao"] as const) {
    const value = (raw as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) changes[field] = parseQuestionFieldChange(field, value) as string;
  }
  const rawDecision = body.granularity_decision;
  const granularityDecision: GranularityDecision | null = rawDecision === "paragrafo_inteiro" || rawDecision === "recorte_inciso" ? rawDecision : null;
  if (!Object.keys(changes).length && !granularityDecision) throw new ArticleContextStandardizationError(400, "Informe ao menos um campo para padronizar ou decida a granularidade da legislação.");
  return { lawSlug, slug, ordem, changes, granularityDecision };
}

async function load(body: Record<string, unknown>) {
  const user = await obterAdministrador();
  if (!user) throw new ArticleContextStandardizationError(401, "Autenticação administrativa obrigatória.");
  const input = parse(body); const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug,titulo").eq("slug", input.lawSlug).eq("ativo", true).maybeSingle();
  if (law.error || !law.data) throw new ArticleContextStandardizationError(404, "Lei ativa não encontrada.");
  const questions = await db.from("questions").select("id,titulo,assunto,ordem,legislacao").eq("lei_id", law.data.id).eq("slug", input.slug).eq("ordem", input.ordem).eq("ativo", true).order("id");
  if (questions.error) throw new ArticleContextStandardizationError(502, "Não foi possível carregar as questões do contexto.");
  const rows = (questions.data ?? []) as ContextRow[];
  if (!rows.length) throw new ArticleContextStandardizationError(404, "Não há questões ativas neste contexto.");
  const nextOrder = input.changes.ordem ?? input.ordem;
  const [bot, community, highlights, targetBot] = await Promise.all([
    db.from("legisbot_comentarios").select("id").eq("slug", input.slug.toUpperCase()).eq("ordem", input.ordem).maybeSingle(),
    db.from("legisbot_comentarios_comunidade").select("id", { count: "exact", head: true }).eq("slug", input.slug.toUpperCase()).eq("ordem", input.ordem),
    db.from("legisbot_destaques_usuario").select("id", { count: "exact", head: true }).eq("slug", input.slug.toUpperCase()).eq("ordem", input.ordem),
    nextOrder === input.ordem ? Promise.resolve({ data: null, error: null }) : db.from("legisbot_comentarios").select("id").eq("slug", input.slug.toUpperCase()).eq("ordem", nextOrder).maybeSingle(),
  ]);
  if (bot.error || community.error || highlights.error || targetBot.error) throw new ArticleContextStandardizationError(502, "Não foi possível verificar os vínculos do contexto.");
  if (targetBot.data && Number(targetBot.data.id) !== Number(bot.data?.id)) throw new ArticleContextStandardizationError(409, "Já existe um registro do LegisBot na nova ordem. Escolha outra ordem ou consolide os registros antes de mover o contexto.");
  return { user, input, law: law.data, rows, botId: bot.data?.id ? Number(bot.data.id) : null, communityCount: community.count ?? 0, highlightsCount: highlights.count ?? 0, nextOrder };
}

export async function previewArticleContextStandardization(body: Record<string, unknown>) {
  const data = await load(body);
  const representative = data.rows[0];
  const structuralValidation = validateQuestionStructure({ assunto: data.input.changes.assunto ?? representative.assunto, ordem: data.nextOrder });
  return { questions: data.rows.length, legisbot: data.botId ? 1 : 0, community: data.communityCount, highlights: data.highlightsCount, changes: data.input.changes, granularity_decision: data.input.granularityDecision, next_order: data.nextOrder, structural_validation: structuralValidation };
}

export async function applyArticleContextStandardization(body: Record<string, unknown>) {
  const data = await load(body); const db = getSupabaseServerClient(); const { input, rows, nextOrder } = data;
  const expectedIds = Array.isArray(body.expected_question_ids) ? body.expected_question_ids.map(String).sort() : [];
  if (JSON.stringify(expectedIds) !== JSON.stringify(rows.map((row) => row.id).sort())) throw new ArticleContextStandardizationError(409, "As questões mudaram desde a prévia. Gere uma nova prévia.");
  const questionPatch = { ...input.changes };
  if (Object.keys(questionPatch).length) {
    const questions = await db.from("questions").update(questionPatch).eq("lei_id", data.law.id).eq("slug", input.slug).eq("ordem", input.ordem).eq("ativo", true).select("id");
    if (questions.error || (questions.data?.length ?? 0) !== rows.length) throw new ArticleContextStandardizationError(409, "Não foi possível atualizar todas as questões do contexto. Nenhuma referência externa foi movida.");
  }
  const slug = input.slug.toUpperCase();
  if (data.botId && Object.keys(questionPatch).length) {
    const botPatch: Record<string, unknown> = { precisa_revisao: true };
    if (input.changes.ordem) botPatch.ordem = nextOrder;
    if (input.changes.assunto) botPatch.assunto = input.changes.assunto;
    if (input.changes.legislacao) botPatch.legislacao = input.changes.legislacao;
    const bot = await db.from("legisbot_comentarios").update(botPatch).eq("id", data.botId);
    if (bot.error) throw new ArticleContextStandardizationError(502, "As questões foram atualizadas, mas o registro do LegisBot não pôde ser sincronizado. Recarregue os dados antes de tentar novamente.");
  }
  if (input.granularityDecision) {
    const decision = await db.from("article_context_mappings").upsert({ slug: input.slug, ordem: nextOrder, granularidade_legislacao: input.granularityDecision, granularidade_decidida_em: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "slug,ordem" });
    if (decision.error) throw new ArticleContextStandardizationError(502, "As questões foram atualizadas, mas não foi possível registrar a decisão de granularidade.");
  }
  if (input.changes.ordem) {
    const [community, highlights] = await Promise.all([
      db.from("legisbot_comentarios_comunidade").update({ ordem: nextOrder }).eq("slug", slug).eq("ordem", input.ordem),
      db.from("legisbot_destaques_usuario").update({ ordem: nextOrder }).eq("slug", slug).eq("ordem", input.ordem),
    ]);
    if (community.error || highlights.error) throw new ArticleContextStandardizationError(502, "As questões foram atualizadas, mas uma referência vinculada não pôde ser movida. Recarregue os dados antes de tentar novamente.");
  }
  const structuralValidation = validateQuestionStructure({ assunto: input.changes.assunto ?? rows[0].assunto, ordem: nextOrder });
  return { questions: rows.length, legisbot: data.botId ? 1 : 0, community: data.communityCount, highlights: data.highlightsCount, granularity_decision: input.granularityDecision, next_order: nextOrder, moved: nextOrder !== input.ordem, structural_validation: structuralValidation };
}
