import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const migration = (name) => readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8");
const ref = "00000000-0000-4000-8000-000000000101";
const missing = "00000000-0000-4000-8000-000000000102";
const scope = "00000000-0000-4000-8000-000000000501";
const other = "00000000-0000-4000-8000-000000000502";
const sha = "ab".repeat(32);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.leis(id bigint primary key, slug text unique);
    create table public.questions(id uuid primary key);
    create table public.law_structure(id bigint primary key, lei_id bigint not null, unique(id, lei_id));
    create table public.recortes_leis(id uuid primary key, lei_id bigint not null);
    insert into public.recortes_leis values ('${scope}',1),('${other}',2);
    insert into public.leis values (1,'one'),(2,'two');
    insert into public.law_structure values (10,1),(11,1),(20,2);`);
  await db.exec(await migration("20261014110000_create_legislative_references.sql"));
  await db.exec(await migration("20261112223813_add_legislative_reference_structure_link.sql"));
  await db.exec(await migration("20261123230000_add_scoped_reading_certificates.sql"));
  await db.query("insert into legislative_references (id,lei_id,slug,ordem,identificacao,structure_id,legislacao) values ($1,1,'one','1','Art. 1',10,'Texto')", [ref]);
  const insert = (r,law,structure,scopeId=scope) => db.query("insert into scoped_reading_certificates (reference_id,lei_id,structure_id,sha256,recorte_id) values ($1,$2,$3,$4,$5)", [r,law,structure,sha,scopeId]);
  await assert.rejects(insert(ref, 1, 10, other), { code: "23503" });
  await assert.rejects(insert(ref, 2, 20), { code: "23503" });
  await assert.rejects(insert(ref, 1, 11), { code: "23503" });
  await assert.rejects(insert(ref, 2, null), { code: "23503" });
  await assert.rejects(insert(missing, 1, 10), { code: "23503" });
  await insert(ref,1,10);
  for (const role of ["anon","authenticated","service_role"]) {
    await db.exec(`set role ${role}`);
    if (role === "service_role") {
      assert.equal((await db.query("select reference_id from scoped_reading_certificates")).rows.length,1);
      await assert.rejects(db.query("update scoped_reading_certificates set sha256=$1",[sha]),{code:"42501"});
    } else await assert.rejects(db.query("select * from scoped_reading_certificates"),{code:"42501"});
    await db.exec("reset role");
  }
  await db.exec("update legislative_references set structure_id=11");
  assert.equal(Number((await db.query("select structure_id from scoped_reading_certificates")).rows[0].structure_id),11);
  await db.exec("delete from law_structure where id=11");
  assert.deepEqual((await db.query("select structure_id from scoped_reading_certificates")).rows,[{structure_id:null}]);
  assert.deepEqual((await db.query("select structure_id from legislative_references")).rows,[{structure_id:null}]);
  await db.exec("delete from legislative_references");
  assert.deepEqual((await db.query("select * from scoped_reading_certificates")).rows,[]);
  console.log("PASS FKs same law/exact structure; no anon/student read; server read-only; reassignment, structure deletion and reference deletion still succeed.");
} finally { await db.close(); }
