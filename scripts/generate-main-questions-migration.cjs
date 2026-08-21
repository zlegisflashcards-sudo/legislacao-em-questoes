const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const backupPath = resolve(process.argv[2] ?? ".codex-backups/legacy-questions-pre-main-migration.json");
const outputPath = resolve(process.argv[3] ?? ".codex-backups/migrate-legacy-questions-to-main.sql");
const backup = JSON.parse(readFileSync(backupPath, "utf8"));
const main = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const q = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  let tag = "$lf$"; while (String(value).includes(tag)) tag = `$lf${tag.length}$`;
  return `${tag}${String(value)}${tag}`;
};
const col = ["id", "lei_id", "structure_id", "pergunta", "resposta", "justificativa", "assunto", "legislacao", "ordem", "titulo", "total_artigos", "slug", "ultima_alteracao_legislativa", "capitulo", "secao", "subsecao", "artigo", "ativo", "created_at", "updated_at"];

async function mainTask() {
  const [lawsResult, questionCount, structureCount] = await Promise.all([
    main.from("leis").select("id,slug").in("slug", backup.laws.map((law) => law.slug)),
    main.from("questions").select("id", { count: "exact", head: true }),
    main.from("law_structure").select("id", { count: "exact", head: true }),
  ]);
  for (const result of [lawsResult, questionCount, structureCount]) if (result.error) throw new Error(result.error.message);
  if ((questionCount.count ?? 0) || (structureCount.count ?? 0)) throw new Error("Destino não está vazio; a migração não fará merge automático.");
  const mainLawBySlug = new Map((lawsResult.data ?? []).map((law) => [law.slug, law.id]));
  const missing = backup.laws.map((law) => law.slug).filter((slug) => !mainLawBySlug.has(slug));
  if (missing.length) throw new Error(`Leis ausentes no principal: ${missing.join(", ")}`);
  const sourceLawById = new Map(backup.laws.map((law) => [law.id, law]));
  const structuresByLaw = new Map();
  for (const row of backup.law_structure) structuresByLaw.set(row.law_id, [...(structuresByLaw.get(row.law_id) ?? []), row]);
  const lines = ["begin;", "create temp table _legacy_structure_map (old_id bigint primary key, new_id bigint not null) on commit drop;"];
  for (const law of backup.laws) {
    const destinationLawId = mainLawBySlug.get(law.slug);
    const unresolved = [...(structuresByLaw.get(law.id) ?? [])];
    const migrated = new Set();
    while (unresolved.length) {
      const index = unresolved.findIndex((node) => node.parent_id === null || migrated.has(node.parent_id));
      if (index < 0) throw new Error(`Hierarquia inválida na lei ${law.slug}.`);
      const node = unresolved.splice(index, 1)[0];
      const parent = node.parent_id === null ? "null" : `(select new_id from _legacy_structure_map where old_id=${q(node.parent_id)})`;
      lines.push(`do $$ declare v_new_id bigint; begin insert into public.law_structure (lei_id,parent_id,tipo,nome,ordem,ativo,created_at,updated_at) values (${q(destinationLawId)},${parent},${q(node.tipo)},${q(node.nome)},${q(node.ordem)},${q(node.ativo)},${q(node.created_at)},${q(node.updated_at)}) returning id into v_new_id; insert into _legacy_structure_map (old_id,new_id) values (${q(node.id)},v_new_id); end $$;`);
      migrated.add(node.id);
    }
  }
  for (const row of backup.questions) {
    const law = sourceLawById.get(row.law_id); if (!law) throw new Error(`Questão ${row.id} aponta para lei ausente.`);
    const values = col.map((name) => name === "lei_id" ? q(mainLawBySlug.get(law.slug)) : name === "structure_id" && row.structure_id !== null ? `(select new_id from _legacy_structure_map where old_id=${q(row.structure_id)})` : q(row[name]));
    lines.push(`insert into public.questions (${col.join(",")}) values (${values.join(",")});`);
  }
  lines.push("commit;"); mkdirSync(resolve(outputPath, ".."), { recursive: true }); writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, laws: backup.laws.length, structures: backup.law_structure.length, questions: backup.questions.length }));
}
mainTask().catch((error) => { console.error(error.message); process.exit(1); });
