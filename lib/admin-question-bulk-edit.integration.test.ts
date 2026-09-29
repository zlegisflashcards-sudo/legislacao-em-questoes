import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.BULK_QUESTION_EDIT_LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const suite = process.env.RUN_BULK_QUESTION_EDIT_DB_INTEGRATION === "1" ? describe.sequential : describe.skip;

function assertDisposableDatabase() {
  const url = new URL(databaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54322') throw new Error("Esta suíte só pode usar PostgreSQL local descartável na porta 54322.");
}

suite("edição em lote administrativa em PostgreSQL descartável", () => {
  const suffix = randomUUID().slice(0, 8); const actorId = randomUUID(); let db: Client; let lawId = 0; let otherLawId = 0;
  async function question(order: string, text = `Questão ${randomUUID()}`) { return (await db.query<{ id: string }>("insert into public.questions(lei_id,pergunta,resposta,ordem,slug,ativo) values($1,$2,'Certo',$3,$4,true) returning id", [lawId, text, order, `bulk-edit-${suffix}`])).rows[0].id; }
  async function edit(ids: string[], field: string, value: unknown, expected: Array<{ id: string; before: unknown }>) { return (await db.query<{ result: Record<string, unknown> }>("select public.admin_bulk_update_law_questions($1,$2,$3,$4::jsonb,$5::jsonb,$6) as result", [lawId, ids, field, JSON.stringify(value), JSON.stringify(expected), actorId])).rows[0].result; }

  beforeAll(async () => {
    assertDisposableDatabase(); db = new Client({ connectionString: databaseUrl }); await db.connect();
    const exists = await db.query("select to_regprocedure('public.admin_bulk_update_law_questions(bigint,uuid[],text,jsonb,jsonb,uuid)') as fn");
    if (!exists.rows[0]?.fn) throw new Error("A migration de edição em lote deve ser aplicada previamente no PostgreSQL local descartável.");
    await db.query("begin");
    await db.query("insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'',now(),'{}','{}',now(),now())", [actorId, `bulk-edit-${suffix}@example.test`]);
    lawId = Number((await db.query("insert into public.leis(slug,titulo) values($1,$2) returning id", [`bulk-edit-${suffix}`, "Lei de teste de edição em lote"])).rows[0].id);
    otherLawId = Number((await db.query("insert into public.leis(slug,titulo) values($1,$2) returning id", [`bulk-edit-other-${suffix}`, "Outra lei"])).rows[0].id);
  });
  afterAll(async () => { if (db) { await db.query("rollback"); await db.end(); } });

  it("atualiza um campo, preserva UUID e os demais campos", async () => {
    const id = await question("1"); await edit([id], "total_artigos", 99, [{ id, before: null }]);
    expect((await db.query("select id,total_artigos,pergunta,resposta,ordem from public.questions where id=$1", [id])).rows[0]).toMatchObject({ id, total_artigos: 99, resposta: "Certo", ordem: "1" });
  });

  it("bloqueia IDs de outra lei sem atualização parcial", async () => {
    const own = await question("2"); const other = (await db.query<{ id: string }>("insert into public.questions(lei_id,pergunta,resposta,ordem,slug,ativo) values($1,'Outra','Certo','1',$2,true) returning id", [otherLawId, `other-${suffix}`])).rows[0].id;
    await expect(edit([own, other], "assunto", "novo", [{ id: own, before: null }, { id: other, before: null }])).rejects.toThrow();
    expect((await db.query("select assunto from public.questions where id=$1", [own])).rows[0].assunto).toBeNull();
  });

  it("exige nova prévia diante de mudança concorrente", async () => {
    const id = await question("3"); await db.query("update public.questions set assunto='concorrente' where id=$1", [id]);
    await expect(edit([id], "assunto", "novo", [{ id, before: null }])).rejects.toThrow(/previa/);
    expect((await db.query("select assunto from public.questions where id=$1", [id])).rows[0].assunto).toBe("concorrente");
  });

  it("reverte a operação que criaria duplicidade de ordem e enunciado", async () => {
    const text = `Duplicada ${suffix}`; const first = await question("10", text); const second = await question("11", text);
    await expect(edit([second], "ordem", "10", [{ id: second, before: "11" }])).rejects.toThrow(/duplicadas/);
    expect((await db.query("select ordem from public.questions where id=$1", [second])).rows[0].ordem).toBe("11");
    expect((await db.query("select ordem from public.questions where id=$1", [first])).rows[0].ordem).toBe("10");
  });
});
