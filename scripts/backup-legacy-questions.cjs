const { createClient } = require("@supabase/supabase-js");
const { createHash } = require("node:crypto");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const url = process.env.QUESTOES_SUPABASE_URL;
const key = process.env.QUESTOES_SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("A fonte legada de questões não está configurada.");

async function rows(client, table) {
  const { data, error } = await client.from(table).select("*").order("id");
  if (error) throw new Error(`Falha ao exportar ${table}: ${error.message}`);
  return data ?? [];
}

async function main() {
  const source = createClient(url, key, { auth: { persistSession: false } });
  const [laws, structure, questions] = await Promise.all([
    rows(source, "laws"),
    rows(source, "law_structure"),
    rows(source, "questions"),
  ]);
  const payload = { version: 1, createdAt: new Date().toISOString(), laws, law_structure: structure, questions };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const digest = createHash("sha256").update(json).digest("hex");
  const target = resolve(process.argv[2] ?? `backups/legacy-questions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  mkdirSync(resolve(target, ".."), { recursive: true });
  writeFileSync(target, json, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ target, sha256: digest, laws: laws.length, lawStructure: structure.length, questions: questions.length }));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
