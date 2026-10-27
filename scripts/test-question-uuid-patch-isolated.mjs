// Run with PGLITE_MODULE pointing to a separately installed @electric-sql/pglite.
// The database is in memory and never connects to the site's database.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const patch = JSON.parse(await readFile("lib/LC68PI_CORRECOES_UUID_V1_NAO_IMPORTAR_NO_ANKI.fixture.json", "utf8"));
const migration = await readFile("supabase/migrations/20261026120000_add_admin_question_uuid_patch.sql", "utf8");
const questionSchema = await readFile("supabase/migrations/20260819110000_create_main_questions_schema.sql", "utf8");
const botSchema = await readFile("supabase/migrations/20260711150000_create_legisbot_comentarios.sql", "utf8");
const auditSchema = await readFile("supabase/migrations/20260805135737_create_internal_commercial_access.sql", "utf8");
const noticeSchema = await readFile("supabase/migrations/20260826110000_create_law_update_notices.sql", "utf8");
const db = new PGlite();
const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const operation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hash = "f".repeat(64);
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create table auth.users(id uuid primary key);
 create table public.leis(id bigint primary key, ativo boolean, slug text, titulo text, nome_curto text);
 insert into auth.users values ('${actor}'); insert into public.leis values (1,true,'lc68pi','Lei teste','Lei teste');`);
// Use the repository's table definitions, constraints and relevant triggers.
await db.exec(questionSchema.slice(questionSchema.indexOf("create table if not exists public.law_structure"), questionSchema.indexOf("alter table public.law_structure enable")));
await db.exec(botSchema.slice(botSchema.indexOf("do $$"), botSchema.indexOf("alter table public.legisbot_comentarios enable")));
await db.exec("alter table public.legisbot_comentarios add column precisa_revisao boolean not null default false");
await db.exec(auditSchema.slice(auditSchema.indexOf("create table if not exists public.auditoria_administrativa"), auditSchema.indexOf("create index if not exists auditoria_administrativa_ator_idx")));
await db.exec(noticeSchema.slice(noticeSchema.indexOf("create table if not exists public.law_update_notices"), noticeSchema.indexOf("create table if not exists public.law_update_notice_deliveries")));
await db.exec(noticeSchema.slice(noticeSchema.indexOf("create or replace function public.record_law_update_notice_event"), noticeSchema.indexOf("create or replace function public.publish_law_update_notice")));
await db.exec(noticeSchema.slice(noticeSchema.indexOf("create or replace function public.capture_question_notice_changes"), noticeSchema.indexOf("create or replace function public.capture_structure_notice_changes")));
await db.exec("create trigger law_update_notice_questions_update after update on public.questions referencing old table as old_rows new table as new_rows for each statement execute function public.capture_question_notice_changes()");
await db.exec("insert into public.law_structure(id,lei_id,tipo,nome) values (42,1,'capitulo','Teste')");
await db.exec(migration);
await db.exec("set role anon");
await assert.rejects(db.query("select public.admin_apply_question_uuid_patch($1,$2,1,$3,'[]'::jsonb,'[]'::jsonb)", [operation, actor, hash]), /permission denied/);
await db.exec("reset role");
for (const [index, item] of patch.updates.entries()) {
  await db.query("insert into questions(id,lei_id,ativo,assunto,ordem,updated_at,slug,pergunta,structure_id,resposta,justificativa,legislacao) values ($1,1,true,$2,$3,'2026-01-01T00:00:00Z','lc68pi',$4,42,'Certo','inalterada','inalterada')", [item.uuid, item.expected_before.assunto, item.expected_before.ordem, `pergunta ${index}`]);
}
for (let i = 1; i <= 29; i++) await db.query("insert into questions(id,lei_id,ativo,assunto,ordem,updated_at,slug,pergunta,structure_id,resposta,justificativa,legislacao) values ($1,1,true,'intocado','0099.0.00.0.00.0','2026-01-01T00:00:00Z','lc68pi',$2,42,'Certo','inalterada','inalterada')", [`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`, `extra ${i}`]);
await db.exec("insert into legisbot_comentarios(slug,ordem,titulo,assunto,legislacao) values ('LC68PI','0001.0.00.0.00.0','Teste','Teste','Teste')");
const snapshot = () => db.query("select id,lei_id,ativo,assunto,ordem,updated_at from questions where id = any($1::uuid[]) order by id", [patch.updates.map(x => x.uuid)]).then(r => r.rows);
const call = (id, rows) => db.query("select public.admin_apply_question_uuid_patch($1,$2,1,$3,$4::jsonb,$5::jsonb) result", [id, actor, hash, JSON.stringify(patch.updates), JSON.stringify(rows)]).then(r => r.rows[0].result);
let original = await snapshot();
await db.query("update questions set ativo=false where id=$1", [patch.updates[0].uuid]);
await assert.rejects(call(operation, original), /indisponivel/);
await db.query("update questions set ativo=true where id=$1", [patch.updates[0].uuid]);
original = await snapshot();
await db.exec("create function public.reject_audit() returns trigger language plpgsql as $$ begin raise exception 'audit failed'; end $$; create trigger reject_audit before insert on public.auditoria_administrativa for each row execute function public.reject_audit();");
await assert.rejects(call(operation, original), /audit failed/);
assert.deepEqual(await snapshot(), original, "audit failure must roll back all questions");
assert.equal((await db.query("select count(*)::int n from legisbot_comentarios where precisa_revisao")).rows[0].n, 0);
assert.equal((await db.query("select count(*)::int n from admin_question_uuid_patch_operations")).rows[0].n, 0);
await db.exec("drop trigger reject_audit on public.auditoria_administrativa");
await db.query("update questions set assunto='edição concorrente' where id=$1", [patch.updates[0].uuid]);
await assert.rejects(call(operation, original), /previa/);
assert.equal((await db.query("select count(*)::int n from auditoria_administrativa")).rows[0].n, 0);
await db.query("update questions set assunto=$2 where id=$1", [patch.updates[0].uuid, patch.updates[0].expected_before.assunto]);
const fresh = await snapshot();
const noticesBefore = (await db.query("select count(*)::int n from law_update_notice_changes")).rows[0].n;
const result = await call(operation, fresh);
assert.equal(result.changed_count, 79);
const actual = new Map((await snapshot()).map(row => [row.id, row]));
for (const item of patch.updates) {
  assert.equal(actual.get(item.uuid).assunto, item.changes.assunto ?? item.expected_before.assunto);
  assert.equal(actual.get(item.uuid).ordem, item.changes.ordem ?? item.expected_before.ordem);
}
assert.deepEqual(await call(operation, fresh), result, "operation retry returns the original result");
assert.equal((await db.query("select count(*)::int n from auditoria_administrativa")).rows[0].n, 1);
assert.equal((await db.query("select count(*)::int n from questions")).rows[0].n, 108);
assert.equal((await db.query("select count(*)::int n from questions where structure_id <> 42 or resposta <> 'Certo' or justificativa <> 'inalterada' or legislacao <> 'inalterada'")).rows[0].n, 0);
assert.equal((await db.query("select count(*)::int n from questions where assunto='intocado'")).rows[0].n, 29);
assert.equal((await db.query("select count(*)::int n from legisbot_comentarios where precisa_revisao")).rows[0].n, 1);
assert.equal((await db.query("select count(*)::int n from law_update_notice_changes")).rows[0].n, noticesBefore, "assunto/ordem changes must not generate content notices");
const final = await snapshot();
const repeat = await call("cccccccc-cccc-4ccc-8ccc-cccccccccccc", final);
assert.equal(repeat.changed_count, 0); assert.equal(repeat.already_count, 79);
assert.deepEqual(await snapshot(), final, "idempotent replay must not change timestamps");
assert.equal((await db.query("select count(*)::int n from auditoria_administrativa")).rows[0].n, 1);
await db.close();
console.log("PASS: isolated migration, rollback, concurrency, idempotency, audit and preservation");
