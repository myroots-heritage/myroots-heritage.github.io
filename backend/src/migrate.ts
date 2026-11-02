import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const pool = new Pool({connectionString:process.env.DATABASE_URL});
try {
  const exists=await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
  for(const [version,file] of [['001','001_initial.sql'],['002','002_entry_flows.sql']]){
    if(exists.rows[0].name && (await pool.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount)continue;
    await pool.query(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));exists.rows[0].name='schema_migrations';console.log(`Migration ${version} applied.`);
  }
} finally {await pool.end();}
