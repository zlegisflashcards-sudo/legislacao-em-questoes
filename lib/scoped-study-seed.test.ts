import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { makeScopedReadingSeed, type Snapshot, type RawReference } from "../scripts/scoped-reading-seed-plan";

const scopeId = "09948964-6c60-48ea-9045-1cd861ec8550";
const rawFixture: RawReference[] = [1, 5].map((n) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`, lei_id: 14, ordem: `000${n}.0.00.0.00.0`, identificacao: `Art. ${n}º`,
  preparado_em: "2026-01-01T00:00:00Z", legislacao_atualizada_em: null, situacao: "preparada", structure_id: null, legislacao: `<p>Art. ${n}º. Texto fictício.</p>`,
}));
const owners = new Map([[1, 438], [5, 166]]);
function fixturePins(rows: RawReference[]) {
  return rows.map(({ legislacao, ...row }, index) => ({ ...row, legislacao_sha256: createHash("sha256").update(legislacao).digest("hex"), proposed_structure_id: index ? 166 : 438 }));
}

describe("plano de seed auditável", () => {
  it("não emite plano para versão alterada ou dois artigos no mesmo bloco", () => {
    const pins = fixturePins(rawFixture);
    const changed = rawFixture.map((row, i) => i ? row : { ...row, legislacao: row.legislacao + "<p>Art. 6º. Fora.</p>" });
    expect(() => makeScopedReadingSeed(pins, changed, { lawId: 14, scopeId, expectedCount: 2, articleOwners: owners })).toThrow("versão/estado diverge");
    expect(() => makeScopedReadingSeed(fixturePins(changed), changed, { lawId: 14, scopeId, expectedCount: 2, articleOwners: owners })).toThrow("artigo misto");
  });

  async function seedDb(rows: RawReference[]) {
    const binding = process.env.PGLITE_MODULE!;
    const { PGlite } = await import(/* @vite-ignore */ binding);
    const db = new PGlite();
    try {
      await db.exec(`create table public.legislative_references(id uuid primary key, lei_id bigint, ordem text, identificacao text, preparado_em timestamptz, situacao text, structure_id bigint, legislacao_atualizada_em timestamptz, legislacao text);
      create table public.scoped_reading_certificates(recorte_id uuid, reference_id uuid, lei_id bigint, structure_id bigint, format_version smallint, sha256 text, revoked_at timestamptz, primary key(recorte_id,reference_id));
      create table public.leis(id bigint primary key, ativo bool, status_publicacao text);
      create table public.recortes_leis(id uuid primary key, lei_id bigint, ativo bool, status_publicacao text, acesso_gratuito bool);
      create table public.recortes_leis_estrutura(recorte_id uuid, lei_id bigint, structure_id bigint);
      create table public.law_structure(id bigint, lei_id bigint, ativo bool);
      insert into public.leis values(14,true,'ativa');
      insert into public.recortes_leis values('${scopeId}',14,true,'ativa',true);
      insert into public.recortes_leis_estrutura values('${scopeId}',14,166),('${scopeId}',14,438);
      insert into public.law_structure values(166,14,true),(438,14,true);`);
      for (const r of rows) await db.query("insert into public.legislative_references values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [r.id, r.lei_id, r.ordem, r.identificacao, r.preparado_em, r.situacao, r.structure_id, r.legislacao_atualizada_em, r.legislacao]);
      return db;
    } catch (error) { await db.close(); throw error; }
  }

  it.skipIf(!process.env.PGLITE_MODULE)("commita lote exato em fixture Postgres e reverte quando um único bloco mudou", async () => {
    const db = await seedDb(rawFixture);
    try {
      const sql = makeScopedReadingSeed(fixturePins(rawFixture), rawFixture, { lawId: 14, scopeId, expectedCount: 2, articleOwners: owners });
      await db.query("update public.legislative_references set legislacao='Mudou' where id=$1", [rawFixture[1].id]);
      await expect(db.exec(sql)).rejects.toThrow("Versão editorial divergente");
      await db.exec("rollback");
      expect((await db.query("select structure_id from public.legislative_references")).rows.every((r: { structure_id: number|null }) => r.structure_id === null)).toBe(true);
      expect((await db.query("select * from public.scoped_reading_certificates")).rows).toHaveLength(0);
      await db.query("update public.legislative_references set legislacao=$1 where id=$2", [rawFixture[1].legislacao, rawFixture[1].id]);
      await db.exec(sql);
      await db.exec(sql);
      expect((await db.query("select * from public.scoped_reading_certificates")).rows).toHaveLength(2);
    } finally { await db.close(); }
  });

  it.skipIf(!process.env.SCOPED_READING_REVIEW_FILES)("gera SQL local revisável, sem se conectar ao banco", async () => {
    const [snapshotPath, rawPath, outputPath] = JSON.parse(process.env.SCOPED_READING_REVIEW_FILES!) as string[];
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as Snapshot[];
    const payload = JSON.parse(await readFile(rawPath, "utf8")) as RawReference[];
    const mainOwners = new Map([[1, 438], [2, 438], [3, 438], [4, 438], [5, 166]]);
    const sql = makeScopedReadingSeed(snapshot, payload, { lawId: 14, scopeId, expectedCount: 84, articleOwners: mainOwners });
    await writeFile(outputPath, sql, { mode: 0o600 });
    expect(sql).toContain("wanted bigint := 84;");
    if (process.env.PGLITE_MODULE) {
      const db = await seedDb(payload);
      try {
        await db.exec(sql);
        expect((await db.query("select reference_id from public.scoped_reading_certificates order by reference_id")).rows.map((row: { reference_id: string }) => row.reference_id)).toEqual(snapshot.map((row) => row.id).sort());
      } finally { await db.close(); }
    }
  });
});
