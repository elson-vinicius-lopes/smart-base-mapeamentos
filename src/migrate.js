import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, close, EMBED_DIM } from './db.js';

const sqlPath = fileURLToPath(new URL('../sql/init.sql', import.meta.url));

try {
  const sql = (await readFile(sqlPath, 'utf8')).replaceAll('__EMBED_DIM__', String(EMBED_DIM));
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
  );
  console.log(`Migração aplicada (vector(${EMBED_DIM})). Tabelas no schema public: ${rows[0].n}`);
} catch (err) {
  console.error('Falha na migração:', err.message);
  process.exitCode = 1;
} finally {
  await close();
}
