import { buildPublicLawContentTree, type PublicLawContentTreeNode } from "@/lib/public-law-content-tree";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type QueryError = { message: string } | null;
type QueryResult = { data: Record<string, unknown>[] | null; error: QueryError };
type PublicLawContentTreeQuery = {
  select: (columns: string) => PublicLawContentTreeQuery;
  eq: (column: string, value: string | number | boolean) => PublicLawContentTreeQuery;
  then: Promise<QueryResult>["then"];
};

export type PublicLawContentTreeDatabase = {
  from: (table: string) => PublicLawContentTreeQuery;
};

export type PublicLawCommercialSummary = {
  legislation: { status: "updated" | "pending"; reference: string | null };
  modules: { materiais: boolean; anki: boolean; legiscast: boolean; questoes: boolean };
};

function numericId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function structureRows(rows: Record<string, unknown>[]) {
  return rows.flatMap((row) => {
    const id = numericId(row.id);
    const parentId = row.parent_id === null ? null : numericId(row.parent_id);
    if (id === null || (row.parent_id !== null && parentId === null) || typeof row.tipo !== "string" || typeof row.nome !== "string") return [];
    return [{ id, parent_id: parentId, tipo: row.tipo, nome: row.nome, ordem: typeof row.ordem === "number" ? row.ordem : null, audio_not_applicable: row.audio_not_applicable === true }];
  });
}

function structureIds(rows: Record<string, unknown>[]) {
  return rows.map((row) => numericId(row.structure_id)).filter((id): id is number => id !== null);
}

function fail(message: string, error: QueryError) {
  if (error) throw new Error(`${message}: ${error.message}`);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Resumo público da Central da Lei, sem campos comerciais redundantes. */
export async function loadPublicLawCommercialSummary({
  lawId,
  db = getSupabaseServerClient() as unknown as PublicLawContentTreeDatabase,
}: {
  lawId: number;
  db?: PublicLawContentTreeDatabase;
}): Promise<PublicLawCommercialSummary | null> {
  const law = await db.from("leis").select("id,houve_alteracao_legislativa,ultima_alteracao_referencia,norma_originaria_referencia,situacao_atualizacao").eq("id", lawId).eq("ativo", true).eq("status_publicacao", "ativa");
  fail("Não foi possível carregar o estado da legislação", law.error);
  const row = law.data?.[0];
  if (!row) return null;

  const checks = await db.from("admin_law_overview_checks").select("item").eq("lei_id", lawId);
  fail("Não foi possível carregar os módulos da lei", checks.error);
  const completed = new Set((checks.data ?? []).map((check) => text(check.item)).filter((item): item is "materiais" | "anki" | "legiscast" | "questoes" => item === "materiais" || item === "anki" || item === "legiscast" || item === "questoes"));
  const updated = row.situacao_atualizacao === "atualizado";

  return {
    legislation: {
      status: updated ? "updated" : "pending",
      reference: row.houve_alteracao_legislativa === true ? text(row.ultima_alteracao_referencia) : text(row.norma_originaria_referencia),
    },
    modules: {
      materiais: completed.has("materiais"),
      anki: completed.has("anki"),
      legiscast: completed.has("legiscast"),
      questoes: completed.has("questoes"),
    },
  };
}

/**
 * Carrega somente a projeção pública necessária para a árvore comercial.
 * Nenhum conteúdo de questão, URL de mídia ou dado administrativo sai daqui.
 */
export async function loadPublicLawContentTree({
  lawId,
  recorteId = null,
  db = getSupabaseServerClient() as unknown as PublicLawContentTreeDatabase,
}: {
  lawId: number;
  recorteId?: string | null;
  db?: PublicLawContentTreeDatabase;
}): Promise<PublicLawContentTreeNode[] | null> {
  const law = await db.from("leis").select("id").eq("id", lawId).eq("ativo", true).eq("status_publicacao", "ativa");
  fail("Não foi possível validar a lei", law.error);
  if (!law.data?.length) return null;

  let scopeStructureIds: number[] | null = null;
  if (recorteId) {
    const scope = await db.from("recortes_leis").select("id").eq("id", recorteId).eq("lei_id", lawId).eq("ativo", true);
    fail("Não foi possível validar o recorte", scope.error);
    if (!scope.data?.length) return null;

    const links = await db.from("recortes_leis_estrutura").select("structure_id").eq("recorte_id", recorteId).eq("lei_id", lawId);
    fail("Não foi possível carregar a estrutura do recorte", links.error);
    scopeStructureIds = structureIds(links.data ?? []);
  }

  const [structure, questions, audios] = await Promise.all([
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem,audio_not_applicable").eq("lei_id", lawId).eq("ativo", true),
    db.from("questions").select("structure_id").eq("lei_id", lawId).eq("ativo", true),
    db.from("legiscast_audios").select("structure_id").eq("lei_id", lawId).eq("ativo", true),
  ]);
  fail("Não foi possível carregar a estrutura da lei", structure.error);
  fail("Não foi possível carregar as questões da lei", questions.error);
  fail("Não foi possível carregar os áudios da lei", audios.error);

  return buildPublicLawContentTree({
    structure: structureRows(structure.data ?? []),
    questions: (questions.data ?? []).map((row) => ({ structure_id: numericId(row.structure_id) })),
    audios: (audios.data ?? []).map((row) => ({ structure_id: numericId(row.structure_id) })),
    scopeStructureIds,
  });
}
