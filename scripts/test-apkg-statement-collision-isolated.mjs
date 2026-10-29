// PGLITE_MODULE must point to an external @electric-sql/pglite entrypoint.
// No connection to Supabase or production is made.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db = new PGlite();
try {
  let sql = await readFile("supabase/tests/20261028_apkg_historical_duplicate_rpc.test.sql", "utf8");
  const migration = await readFile("supabase/migrations/20261027120000_add_safe_apkg_uuid_question_updates.sql", "utf8");
  const legacy = await readFile("supabase/migrations/20261028010000_allow_unchanged_legacy_apkg_order.sql", "utf8");
  sql = sql.replace(/\\i[^\r\n]+/, () => migration + "\n" + legacy);
  // Change the fixture from historical duplication to a newly introduced collision.
  sql = sql.replace("1, true, 'Assertiva historicamente duplicada', 'Certo'", "1, true, 'Texto original', 'Certo'");
  sql = sql.replace('"expected":{"pergunta":"Assertiva historicamente duplicada"', '"expected":{"pergunta":"Texto original"');
  sql = sql.replace("select public.admin_apply_apkg_uuid_question_updates(1,", `
    create table public.test_history(question_id uuid references questions(id), attempts integer);
    insert into public.test_history values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 7);
    select public.admin_apply_apkg_uuid_question_updates(1,`);
  sql = sql.replace("rollback;", () => `
    do $$ begin
      if not exists (select 1 from questions where id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and pergunta='Assertiva historicamente duplicada' and structure_id=77) then raise exception 'collision update failed'; end if;
      if (select count(*) from questions where pergunta='Assertiva historicamente duplicada') <> 2 then raise exception 'duplicate removed'; end if;
      if not exists (select 1 from test_history where question_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and attempts=7) then raise exception 'history lost'; end if;
    end $$;
    rollback;`);
  await db.exec(sql);
  assert.equal((await db.query("select count(*)::int n from questions")).rows[0].n, 0);
  console.log("PASS: real PostgreSQL RPC accepts new statement collision, preserves UUID/structure/history, records audit; fixture rolled back.");
} catch (error) { console.error(error.message); process.exitCode = 1; } finally { await db.close(); }
