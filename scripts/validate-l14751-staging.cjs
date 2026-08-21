const { Client } = require("pg");
const client = new Client({ connectionString: process.env.STAGING_DATABASE_URL, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
client.connect().then(async () => {
  const result = await client.query("select count(*) filter (where q.lei_id <> l.id)::int as wrong_law_fk, count(*) filter (where q.structure_id is null)::int as null_structure_fk, count(*) filter (where s.lei_id <> l.id)::int as wrong_structure_fk, count(*)::int as questions from public.questions q join public.leis l on l.id=q.lei_id left join public.law_structure s on s.id=q.structure_id where l.slug=$1", ["l14751"]);
  console.log(JSON.stringify(result.rows[0]));
  await client.end();
}).catch(async (error) => { console.error(error.message); try { await client.end(); } catch {} process.exit(1); });
