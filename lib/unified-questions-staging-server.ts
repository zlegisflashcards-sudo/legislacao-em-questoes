import "server-only";
import { Client } from "pg";

/** Transição explícita: somente l14751 usa o schema unificado quando o staging foi configurado. */
export const UNIFIED_STAGING_LAW_SLUG = "l14751";

// O Next carrega `.env.local`, mas não `.env.staging.local` automaticamente.
// Quando presente, esse arquivo é a configuração explícita da fonte unificada;
// em ambientes publicados, a variável continua podendo vir do próprio ambiente.
if (!process.env.STAGING_DATABASE_URL) {
  try { process.loadEnvFile(".env.staging.local"); } catch { /* A mensagem explícita é emitida ao acessar l14751. */ }
}

export function usesUnifiedStagingQuestions(slug: string) { return slug === UNIFIED_STAGING_LAW_SLUG; }
export async function withUnifiedStagingClient<T>(work: (client: Client) => Promise<T>) {
  const connectionString = process.env.STAGING_DATABASE_URL;
  if (!connectionString) throw new Error("STAGING_DATABASE_URL não configurada para a fonte unificada de questões.");
  const client = new Client({ connectionString, password: process.env.SUPABASE_DB_PASSWORD || undefined, ssl: { rejectUnauthorized: false } });
  await client.connect(); try { return await work(client); } finally { await client.end(); }
}
export async function unifiedLawBySlug(slug: string) { return withUnifiedStagingClient(async (client) => (await client.query("select id::int as id,slug,titulo,nome_curto,codigo from public.leis where slug=$1 and ativo=true", [slug])).rows[0] ?? null); }
export async function unifiedStructure(leiId: number) { return withUnifiedStagingClient(async (client) => (await client.query("select id::int as id,lei_id::int as law_id,parent_id::int as parent_id,tipo,nome,ordem,ativo,created_at,updated_at from public.law_structure where lei_id=$1 and ativo=true order by ordem,id", [leiId])).rows); }
export async function unifiedQuestions(leiId: number, filters: { structureIds?: number[]; values?: Record<string, string> } = {}) { return withUnifiedStagingClient(async (client) => { const params: unknown[] = [leiId]; const where = ["lei_id=$1", "ativo=true"]; if (filters.structureIds?.length) { params.push(filters.structureIds); where.push(`structure_id = any($${params.length}::bigint[])`); } for (const [field, value] of Object.entries(filters.values ?? {})) { if (!["titulo", "capitulo", "secao", "subsecao"].includes(field)) continue; params.push(value); where.push(`${field}=$${params.length}`); } return (await client.query(`select id::text as id,lei_id::int as law_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,structure_id::int as structure_id,ativo,created_at,updated_at from public.questions where ${where.join(" and ")} order by ordem`, params)).rows; }); }
export async function unifiedActiveQuestionCount(leiId: number) {
  return withUnifiedStagingClient(async (client) => {
    const result = await client.query(
      "select count(*)::int as total from public.questions where lei_id=$1 and ativo=true",
      [leiId],
    );
    return Number(result.rows[0]?.total ?? 0);
  });
}
