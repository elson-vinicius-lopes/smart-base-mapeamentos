import { pool, close } from './db.js';
import { embedTextos, toVector, providerName } from './embeddings.js';

const LOTE = parseInt(process.env.EMBED_BATCH ?? '32', 10);
const FORCE = process.argv.includes('--force');

try {
  const t0 = performance.now();
  console.log(`Provedor de embeddings: ${providerName()}`);
  if (FORCE) await pool.query('TRUNCATE mapeamento_embedding');

  const { rows } = await pool.query(
    `SELECT m.id, m.titulo || E'\n' || m.descricao || E'\n' || m.regras_texto AS conteudo
       FROM mapeamento m
       LEFT JOIN mapeamento_embedding e ON e.mapeamento_id = m.id
      WHERE e.mapeamento_id IS NULL
      ORDER BY m.id`
  );
  console.log(`${rows.length} mapeamentos sem embedding.`);

  let feitos = 0;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    const vetores = await embedTextos(lote.map((r) => r.conteudo.slice(0, 6000)), 'document');
    await pool.query(
      `INSERT INTO mapeamento_embedding (mapeamento_id, conteudo, embedding)
       SELECT * FROM unnest($1::int[], $2::text[], $3::vector[])
       ON CONFLICT (mapeamento_id) DO UPDATE
         SET conteudo = EXCLUDED.conteudo, embedding = EXCLUDED.embedding, atualizado_em = now()`,
      [lote.map((r) => r.id), lote.map((r) => r.conteudo), vetores.map(toVector)]
    );
    feitos += lote.length;
    if (feitos % (LOTE * 10) === 0 || feitos === rows.length) {
      process.stdout.write(`\r  ${feitos}/${rows.length}`);
    }
  }
  const { rows: r } = await pool.query('SELECT count(*)::int n FROM mapeamento_embedding');
  console.log(`\nEmbeddings gravados: ${r[0].n} (tempo ${((performance.now() - t0) / 1000).toFixed(1)}s)`);
} catch (err) {
  console.error('\nFalha ao gerar embeddings:', err.message);
  process.exitCode = 1;
} finally {
  await close();
}
