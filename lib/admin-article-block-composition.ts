import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { previewBlockSplit, previewBlockUnification, type ArticleBlock, type BlockDependency, type SplitPiece } from "@/lib/article-block-composition";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const value = (input: unknown, max = 120) => typeof input === "string" ? input.trim().slice(0, max) : "";

function asBlock(row: Record<string, unknown>): ArticleBlock {
  return { id: String(row.id), leiId: Number(row.lei_id), slug: String(row.slug), ordem: String(row.ordem), identificacao: String(row.identificacao), legislacao: String(row.legislacao ?? ""), updatedAt: String(row.updated_at), situacao: typeof row.situacao === "string" ? row.situacao : null };
}

async function dependencies(blocks: ArticleBlock[]): Promise<BlockDependency[]> {
  const db = getSupabaseServerClient();
  const ids = blocks.map((block) => block.id);
  const byOrder = new Map(blocks.map((block) => [block.ordem, block.id]));
  const [bots, links, highlights, repairs, community, mappings] = await Promise.all([
    db.from("legisbot_comentarios").select("id,reference_id,ordem,assunto,status").in("reference_id", ids),
    db.from("question_legislative_reference_links").select("question_id,reference_id").in("reference_id", ids),
    db.from("legisbot_destaques_usuario").select("id,reference_id,ordem").in("reference_id", ids),
    db.from("legislative_reference_identifier_repairs").select("id,reference_id,ordem").in("reference_id", ids),
    db.from("legisbot_comentarios_comunidade").select("id,ordem,status").eq("slug", blocks[0].slug.toUpperCase()).in("ordem", blocks.map((block) => block.ordem)),
    db.from("article_context_mappings").select("id,ordem").eq("slug", blocks[0].slug.toLowerCase()).in("ordem", blocks.map((block) => block.ordem)),
  ]);
  for (const result of [bots, links, highlights, repairs, community, mappings]) if (result.error) throw new Error("Não foi possível levantar todos os vínculos do bloco. A operação não foi iniciada.");
  return [
    ...(bots.data ?? []).map((row) => ({ kind: "legisbot" as const, id: String(row.reference_id), ordem: String(row.ordem), detail: `LegisBot #${row.id}: ${String(row.assunto ?? "sem assunto")}` })),
    ...(links.data ?? []).map((row) => ({ kind: "question_link" as const, id: String(row.reference_id), ordem: blocks.find((block) => block.id === String(row.reference_id))?.ordem ?? "", detail: `Vínculo manual da questão ${row.question_id}` })),
    ...(highlights.data ?? []).map((row) => ({ kind: "highlight" as const, id: String(row.reference_id), ordem: String(row.ordem), detail: `Destaque de aluno #${row.id}` })),
    ...(repairs.data ?? []).map((row) => ({ kind: "identifier_repair" as const, id: String(row.reference_id), ordem: String(row.ordem), detail: `Backup de reparo #${row.id}` })),
    ...(community.data ?? []).flatMap((row) => { const id = byOrder.get(String(row.ordem)); return id ? [{ kind: "community_comment" as const, id, ordem: String(row.ordem), detail: `Comentário da comunidade #${row.id} (${row.status})` }] : []; }),
    ...(mappings.data ?? []).flatMap((row) => { const id = byOrder.get(String(row.ordem)); return id ? [{ kind: "mapping" as const, id, ordem: String(row.ordem), detail: `Mapeamento editorial #${row.id}` }] : []; }),
  ];
}

export async function previewArticleBlockComposition(input: { lawSlug: unknown; mode: unknown; referenceIds: unknown; pieces?: unknown }) {
  await exigirAdministrador();
  const slug = value(input.lawSlug).toLowerCase();
  const ids = Array.isArray(input.referenceIds) ? [...new Set(input.referenceIds.filter((id): id is string => typeof id === "string" && UUID.test(id)))] : [];
  if (!slug || !ids.length || ids.length > 20) throw new Error("Selecione de 1 a 20 blocos da lei.");
  const db = getSupabaseServerClient();
  const [law, refs, questions] = await Promise.all([
    db.from("leis").select("id,nome_curto").eq("slug", slug).maybeSingle(),
    db.from("legislative_references").select("id,lei_id,slug,ordem,identificacao,legislacao,updated_at,situacao").eq("slug", slug).in("id", ids).or("situacao.is.null,situacao.neq.arquivada"),
    db.from("questions").select("id,ordem").eq("slug", slug).eq("ativo", true),
  ]);
  if (law.error || !law.data || refs.error || questions.error || (refs.data ?? []).length !== ids.length) throw new Error("Não foi possível montar uma prévia confiável dos blocos selecionados.");
  const lawData = law.data;
  const blocks = (refs.data ?? []).map((row) => asBlock(row as Record<string, unknown>));
  if (blocks.some((block) => block.leiId !== Number(lawData.id) || !block.legislacao.trim())) throw new Error("Todos os blocos devem pertencer à lei e conter texto legislativo preparado.");
  const foundDependencies = await dependencies(blocks);
  const shortName = lawData.nome_curto ? String(lawData.nome_curto) : "";
  if (input.mode === "unificar") return previewBlockUnification({ blocks, lawShortName: shortName, questions: (questions.data ?? []).map((row) => ({ id: String(row.id), ordem: String(row.ordem) })), dependencies: foundDependencies });
  if (input.mode === "separar" && blocks.length === 1 && Array.isArray(input.pieces)) {
    const pieces = input.pieces.flatMap((item): SplitPiece[] => item && typeof item === "object" ? [{ ordem: value((item as Record<string, unknown>).ordem), identificacao: value((item as Record<string, unknown>).identificacao, 500), legislacao: value((item as Record<string, unknown>).legislacao, 100_000) }] : []);
    return previewBlockSplit({ block: blocks[0], pieces, lawShortName: shortName, questions: (questions.data ?? []).map((row) => ({ id: String(row.id), ordem: String(row.ordem) })), dependencies: foundDependencies });
  }
  throw new Error("Para separar, selecione um único bloco e informe os trechos completos da prévia.");
}

/** The RPC is deliberately absent until the local migration is reviewed and applied. */
export async function applyArticleBlockComposition(input: { operation: unknown; expected: unknown; commentTreatment: unknown }) {
  const user = await exigirAdministrador();
  if (input.commentTreatment !== "preservar_e_sinalizar_revisao") throw new Error("Comentários vinculados exigem o tratamento explícito “preservar e sinalizar para revisão”.");
  const result = await getSupabaseServerClient().rpc("admin_apply_legislative_block_composition", { p_actor_user_id: user.id, p_operation: input.operation, p_expected: input.expected, p_comment_treatment: input.commentTreatment });
  if (result.error) throw new Error(result.error.code === "PGRST202" ? "A migration da composição de blocos ainda não foi aplicada neste ambiente." : "A composição não foi aplicada; gere uma nova prévia e revise os vínculos.");
  return result.data;
}
