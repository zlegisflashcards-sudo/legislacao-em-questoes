import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.CONTENT_DELETION_LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suite = process.env.RUN_CONTENT_DELETION_DB_INTEGRATION === "1" ? describe.sequential : describe.skip;

function assertDisposableDatabase() {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54322") throw new Error("Esta suíte só pode usar o PostgreSQL local descartável na porta 54322.");
}

async function connect() { assertDisposableDatabase(); const client = new Client({ connectionString: databaseUrl }); await client.connect(); return client; }

suite("exclusão administrativa definitiva em PostgreSQL descartável", () => {
  const suffix = randomUUID().slice(0, 8);
  const actorId = randomUUID();
  const adminStudentId = randomUUID();
  const otherStudentId = randomUUID();
  let db: Client;
  let lawId = 0;

  async function question(structureId: number | null = null) {
    return (await db.query<{ id: string }>("insert into public.questions(lei_id,structure_id,pergunta,resposta,ordem,slug,ativo) values($1,$2,$3,'Certo',$4,$5,true) returning id", [lawId, structureId, `Questão ${randomUUID()}`, String(Date.now()), `delete-test-${suffix}`])).rows[0].id;
  }

  async function campaign(studentId: string, questionId: string, withActivity = false) {
    const campaignId = (await db.query<{ id: string }>("insert into public.campanhas_leis_alunos(aluno_id,lei_id) values($1,$2) returning id", [studentId, lawId])).rows[0].id;
    const levelId = Number((await db.query<{ id: string }>("insert into public.campanhas_leis_niveis(campanha_id,ordem,chave_origem,nome,questoes_ids) values($1,0,'raiz','Raiz',$2::jsonb) returning id", [campaignId, JSON.stringify([questionId])])).rows[0].id);
    if (withActivity) {
      await db.query("insert into public.campanhas_leis_respostas(campanha_id,nivel_id,questao_id,correta,chave_idempotencia) values($1,$2,$3,true,$4)", [campaignId, levelId, questionId, randomUUID()]);
      await db.query("insert into public.progresso_leis_alunos(aluno_id,lei_id,em_estudo,status_campanha,campanha_ativa_id) values($1,$2,true,'em_andamento',$3)", [studentId, lawId, campaignId]);
    }
    return campaignId;
  }

  async function rpc(questionId: string | null, structureId: number | null, execute: boolean, confirmation: string | null = null) {
    return (await db.query<{ result: Record<string, unknown> }>("select public.admin_delete_law_content_v2($1,$2,$3,$4,$5,$6) as result", [lawId, questionId ? [questionId] : null, structureId, actorId, confirmation, execute])).rows[0].result;
  }
  async function rpcBatch(questionIds: string[], execute: boolean, confirmation: string | null = null) {
    return (await db.query<{ result: Record<string, unknown> }>("select public.admin_delete_law_content_v2($1,$2,$3,$4,$5,$6) as result", [lawId, questionIds, null, actorId, confirmation, execute])).rows[0].result;
  }

  beforeAll(async () => {
    db = await connect();
    const schema = await db.query("select to_regprocedure('public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean)') as function_name");
    if (!schema.rows[0]?.function_name) throw new Error("A migration de exclusão deve ser aplicada previamente no banco local descartável.");
    await db.query("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}','{}',now(),now())", [actorId, `admin-${suffix}@example.test`]);
    lawId = Number((await db.query<{ id: string }>("insert into public.leis(slug,titulo) values($1,$2) returning id", [`delete-test-${suffix}`, "Lei para exclusão controlada"])).rows[0].id);
    await db.query("insert into public.alunos(id,user_id,nome,email) values($1,$2,'Administrador',$3),($4,null,'Outro aluno',$5)", [adminStudentId, actorId, `admin-${suffix}@example.test`, otherStudentId, `outro-${suffix}@example.test`]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query("delete from public.recortes_leis_estrutura where lei_id=$1", [lawId]);
    await db.query("delete from public.recortes_leis where lei_id=$1", [lawId]);
    await db.query("delete from public.leis where id=$1", [lawId]);
    await db.query("delete from public.alunos where id=any($1::uuid[])", [[adminStudentId, otherStudentId]]);
    await db.query("delete from auth.users where id=$1", [actorId]);
    await db.end();
  });

  it("exclui questão sem campanha", async () => {
    const id = await question();
    expect((await rpc(id, null, false)).campaigns_count).toBe(0);
    await rpc(id, null, true);
    expect(Number((await db.query("select count(*) from public.questions where id=$1", [id])).rows[0].count)).toBe(0);
  });

  it("exclui campanha própria inteira e limpa respostas e progresso", async () => {
    const id = await question(); const campaignId = await campaign(adminStudentId, id, true);
    const summary = await rpc(id, null, false);
    expect(summary).toMatchObject({ campaigns_count: 1, answers_count: 1, progresses_count: 1, requires_confirmation: false });
    await rpc(id, null, true);
    expect(Number((await db.query("select count(*) from public.campanhas_leis_alunos where id=$1", [campaignId])).rows[0].count)).toBe(0);
    expect((await db.query("select campanha_ativa_id,status_campanha from public.progresso_leis_alunos where aluno_id=$1 and lei_id=$2", [adminStudentId, lawId])).rows[0]).toEqual({ campanha_ativa_id: null, status_campanha: "nao_iniciada" });
  });

  it("exige EXCLUIR para campanha de outro aluno", async () => {
    const id = await question(); const campaignId = await campaign(otherStudentId, id);
    expect((await rpc(id, null, false)).requires_confirmation).toBe(true);
    await expect(rpc(id, null, true)).rejects.toThrow(/EXCLUIR/);
    expect(Number((await db.query("select count(*) from public.campanhas_leis_alunos where id=$1", [campaignId])).rows[0].count)).toBe(1);
    await rpc(id, null, true, "EXCLUIR");
    expect(Number((await db.query("select count(*) from public.campanhas_leis_alunos where id=$1", [campaignId])).rows[0].count)).toBe(0);
  });

  it("exclui a subárvore, suas questões e todas as campanhas afetadas", async () => {
    const root = Number((await db.query("insert into public.law_structure(lei_id,tipo,nome,ordem,ativo) values($1,'titulo','Título',1,true) returning id", [lawId])).rows[0].id);
    const child = Number((await db.query("insert into public.law_structure(lei_id,parent_id,tipo,nome,ordem,ativo) values($1,$2,'capitulo','Capítulo',1,true) returning id", [lawId, root])).rows[0].id);
    const grandchild = Number((await db.query("insert into public.law_structure(lei_id,parent_id,tipo,nome,ordem,ativo) values($1,$2,'secao','Seção',1,true) returning id", [lawId, child])).rows[0].id);
    const first = await question(root); const second = await question(grandchild); await campaign(adminStudentId, second);
    expect(await rpc(null, root, false)).toMatchObject({ structures_count: 3, substructures_count: 2, questions_count: 2, campaigns_count: 1 });
    await rpc(null, root, true);
    expect(Number((await db.query("select count(*) from public.law_structure where id=any($1::bigint[])", [[root, child, grandchild]])).rows[0].count)).toBe(0);
    expect(Number((await db.query("select count(*) from public.questions where id=any($1::uuid[])", [[first, second]])).rows[0].count)).toBe(0);
  });

  it("exclui várias questões sem remover suas estruturas", async () => {
    const structureId = Number((await db.query("insert into public.law_structure(lei_id,tipo,nome,ordem,ativo) values($1,'titulo','Massa',9,true) returning id", [lawId])).rows[0].id);
    const first = await question(structureId); const second = await question(structureId);
    await campaign(otherStudentId, first);
    expect((await rpcBatch([first, second], false)).questions_count).toBe(2);
    await expect(rpcBatch([first, second], true)).rejects.toThrow(/EXCLUIR/);
    await rpcBatch([first, second], true, "EXCLUIR");
    expect(Number((await db.query("select count(*) from public.questions where id=any($1::uuid[])", [[first, second]])).rows[0].count)).toBe(0);
    expect(Number((await db.query("select count(*) from public.law_structure where id=$1", [structureId])).rows[0].count)).toBe(1);
  });

  it("bloqueia áudio, job e recorte até movimentação ou desvinculação explícita", async () => {
    const structureId = Number((await db.query("insert into public.law_structure(lei_id,tipo,nome,ordem,ativo) values($1,'titulo','Com dependências',2,true) returning id", [lawId])).rows[0].id);
    const audioId = randomUUID(); const jobId = randomUUID();
    await db.query("insert into public.legiscast_audios(id,lei_id,titulo,storage_path,structure_id) values($1,$2,'Áudio',$3,$4)", [audioId, lawId, `delete-test/${audioId}.m4a`, structureId]);
    await db.query("insert into public.legiscast_audio_jobs(id,lei_id,titulo,original_bucket,original_path,original_mime,original_size_bytes,final_path,structure_id) values($1,$2,'Job','test',$3,'audio/mpeg',1,$4,$5)", [jobId, lawId, `delete-test/${jobId}.mp3`, `delete-test/${jobId}.m4a`, structureId]);
    const recorteId = (await db.query("insert into public.recortes_leis(lei_id,nome) values($1,$2) returning id", [lawId, `Recorte ${suffix}`])).rows[0].id;
    await db.query("insert into public.recortes_leis_estrutura(recorte_id,structure_id,lei_id) values($1,$2,$3)", [recorteId, structureId, lawId]);
    expect((await rpc(null, structureId, false)).dependencies_count).toBe(3);
    await expect(rpc(null, structureId, true)).rejects.toThrow(/Mova ou desvincule/i);
    await db.query("update public.legiscast_audios set structure_id=null where id=$1", [audioId]);
    await db.query("update public.legiscast_audio_jobs set structure_id=null where id=$1", [jobId]);
    await db.query("delete from public.recortes_leis_estrutura where recorte_id=$1", [recorteId]);
    await rpc(null, structureId, true);
    expect(Number((await db.query("select count(*) from public.law_structure where id=$1", [structureId])).rows[0].count)).toBe(0);
  });

  it("faz rollback integral quando qualquer exclusão falha", async () => {
    const id = await question(); const campaignId = await campaign(adminStudentId, id);
    await db.query("drop trigger if exists test_block_question_delete on public.questions");
    await db.query("drop function if exists public.test_block_question_delete()");
    await db.query("create function public.test_block_question_delete() returns trigger language plpgsql as $$begin raise exception 'falha controlada'; end$$");
    await db.query("create trigger test_block_question_delete before delete on public.questions for each row execute function public.test_block_question_delete()");
    try { await expect(rpc(id, null, true)).rejects.toThrow(/falha controlada/); }
    finally { await db.query("drop trigger test_block_question_delete on public.questions"); await db.query("drop function public.test_block_question_delete() "); }
    expect(Number((await db.query("select count(*) from public.questions where id=$1", [id])).rows[0].count)).toBe(1);
    expect(Number((await db.query("select count(*) from public.campanhas_leis_alunos where id=$1", [campaignId])).rows[0].count)).toBe(1);
    await rpc(id, null, true);
  });

  it("nega execução a anon e authenticated e permite somente service_role", async () => {
    const privileges = await db.query(`select
      has_function_privilege('anon','public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean)','EXECUTE') as anon,
      has_function_privilege('authenticated','public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean)','EXECUTE') as authenticated,
      has_function_privilege('service_role','public.admin_delete_law_content_v2(bigint,uuid[],bigint,uuid,text,boolean)','EXECUTE') as service_role`);
    expect(privileges.rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
