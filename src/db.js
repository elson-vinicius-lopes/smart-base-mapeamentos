import 'dotenv/config';
import pg from 'pg';

export const EMBED_DIM = parseInt(process.env.EMBED_DIM ?? '768', 10);

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

export const query = (text, params) => pool.query(text, params);

export async function close() {
  await pool.end();
}
