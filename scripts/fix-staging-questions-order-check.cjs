const { Client } = require("pg");
const client = new Client({ connectionString: process.env.STAGING_DATABASE_URL, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
client.connect()
  .then(async () => {
    await client.query("begin");
    await client.query("alter table public.questions drop constraint if exists questions_ordem_check");
    await client.query("alter table public.questions add constraint questions_ordem_check check (ordem ~ '^\\d+(?:\\.\\d+)*$')");
    await client.query("commit");
    console.log("questions_ordem_check corrigida");
  })
  .catch(async (error) => { try { await client.query("rollback"); } catch {} console.error(error.message); process.exitCode = 1; })
  .finally(() => client.end());
