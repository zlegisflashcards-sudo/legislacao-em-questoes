/* Exclusivo para staging: importa imports/l14751.txt para public.leis/law_structure/questions. */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const slug = "l14751";
const source = fs.readFileSync(path.join(process.cwd(), "imports", "l14751.txt"), "utf8");

function parseTsv(input) {
  const rows = []; let fields = []; let field = ""; let quoted = false;
  const finish = () => { fields.push(field); if (fields.some((value) => value !== "")) rows.push(fields); fields = []; field = ""; };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') { if (quoted && input[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted; continue; }
    if (char === "\t" && !quoted) { fields.push(field); field = ""; continue; }
    if (char === "\n" && !quoted) { finish(); continue; }
    if (char !== "\r") field += char;
  }
  if (field || fields.length) finish();
  return rows.filter((row) => !(row.length === 1 && row[0].startsWith("#")));
}
function typeFor(name) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  if (normalized.startsWith("titulo")) return "titulo";
  if (normalized.startsWith("capitulo")) return "capitulo";
  if (normalized.startsWith("secao")) return "secao";
  if (normalized.startsWith("subsecao")) return "subsecao";
  throw new Error(`Tipo estrutural não reconhecido: ${name}`);
}
function key(parentKey, type, name) { return `${parentKey || "raiz"}\0${type}\0${name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()}`; }

async function main() {
  if (!process.env.STAGING_DATABASE_URL) throw new Error("STAGING_DATABASE_URL ausente.");
  const rows = parseTsv(source).map((fields, index) => {
    if (fields.length !== 11 && fields.length !== 12) throw new Error(`Linha de dados ${index + 1}: esperadas 11 ou 12 colunas, encontradas ${fields.length}.`);
    if (fields[9].trim() !== slug) throw new Error(`Linha de dados ${index + 1}: slug inesperado.`);
    const respostaNormalizada = fields[2].trim().toLocaleLowerCase("pt-BR");
    if (respostaNormalizada !== "certo" && respostaNormalizada !== "errado") throw new Error(`Linha de dados ${index + 1}: resposta inválida.`);
    const resposta = respostaNormalizada === "certo" ? "Certo" : "Errado";
    return { deck: fields[0].split("::").map((value) => value.trim()).filter(Boolean), pergunta: fields[1], resposta, justificativa: fields[3], assunto: fields[4], legislacao: fields[5], ordem: fields[6], titulo: fields[7], totalArtigos: fields[8], ultima: fields[10] };
  });
  if (rows.length !== 90) throw new Error(`TXT contém ${rows.length} questões; esperado 90.`);
  const client = new Client({ connectionString: process.env.STAGING_DATABASE_URL, password: process.env.SUPABASE_DB_PASSWORD || undefined, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    const law = await client.query("select id from public.leis where slug = $1 and ativo = true", [slug]);
    if (law.rowCount !== 1) throw new Error("Lei l14751 não encontrada ou inativa no staging.");
    const leiId = law.rows[0].id;
    const existing = await client.query("select (select count(*)::int from public.questions where lei_id = $1) as questions, (select count(*)::int from public.law_structure where lei_id = $1) as structures", [leiId]);
    if (existing.rows[0].questions !== 0 || existing.rows[0].structures !== 0) throw new Error("Staging já possui questões ou estrutura para l14751; importação interrompida sem alterar dados.");
    const ids = new Map();
    for (const row of rows) {
      let parentKey = null;
      for (const name of row.deck.slice(1)) {
        const type = typeFor(name); const nodeKey = key(parentKey, type, name);
        if (!ids.has(nodeKey)) {
          const parentId = parentKey ? ids.get(parentKey) : null;
          const inserted = await client.query("insert into public.law_structure (lei_id,parent_id,tipo,nome,ordem,ativo) values ($1,$2,$3,$4,0,true) returning id", [leiId, parentId, type, name]);
          ids.set(nodeKey, inserted.rows[0].id);
        }
        parentKey = nodeKey;
      }
    }
    if (ids.size !== 8) throw new Error(`TXT gerou ${ids.size} nós; esperado 8.`);
    for (const row of rows) {
      let parentKey = null; for (const name of row.deck.slice(1)) parentKey = key(parentKey, typeFor(name), name);
      await client.query("insert into public.questions (lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,ativo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)", [leiId, parentKey ? ids.get(parentKey) : null, row.pergunta, row.resposta, row.justificativa || null, row.assunto || null, row.legislacao || null, row.ordem, row.titulo || null, /^\d+$/.test(row.totalArtigos) ? Number(row.totalArtigos) : null, slug, row.ultima || null]);
    }
    const summary = await client.query("select (select count(*)::int from public.law_structure where lei_id=$1) as structures, (select count(*)::int from public.questions where lei_id=$1) as questions, (select min(ordem) from public.questions where lei_id=$1) as first_order, (select max(ordem) from public.questions where lei_id=$1) as last_order", [leiId]);
    const byLevel = await client.query("select s.nome, count(q.id)::int as questions from public.law_structure s left join public.questions q on q.structure_id=s.id where s.lei_id=$1 group by s.id,s.nome order by s.id", [leiId]);
    if (summary.rows[0].structures !== 8 || summary.rows[0].questions !== 90) throw new Error("Contagem final diverge do esperado.");
    await client.query("commit");
    console.log(JSON.stringify({ ...summary.rows[0], byLevel: byLevel.rows }));
  } catch (error) { await client.query("rollback"); throw error; } finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exit(1); });
