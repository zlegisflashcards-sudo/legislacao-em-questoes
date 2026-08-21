const { Client } = require("pg");
const client = new Client({ connectionString: process.env.STAGING_DATABASE_URL, password: process.env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
client.connect()
  .then(() => client.query("select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.questions'::regclass order by conname"))
  .then((result) => { console.log(JSON.stringify(result.rows)); return client.end(); })
  .catch(async (error) => { console.error(error.message); try { await client.end(); } catch {} process.exit(1); });
