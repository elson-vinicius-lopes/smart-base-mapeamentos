import { pool, close } from './db.js';
import { embedTextos, toVector, providerName } from './embeddings.js';

const consulta = process.argv.slice(2).join(' ').trim() || 'campo de data chegando em formato errado';
const REPS = 5;

const SQL = `SELECT mapeamento_id FROM mapeamento_embedding ORDER BY embedding <=> $1::vector LIMIT 5`;

async function explain(client, vetor) {
  const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${SQL}`, [vetor]);
  const plano = rows[0]['QUERY PLAN'][0];
  const nos = [];
  (function walk(n) { nos.push(n['Node Type'] + (n['Index Name'] ? ` (${n['Index Name']})` : '')); (n.Plans ?? []).forEach(walk); })(plano.Plan);
  return { exec: plano['Execution Time'], plan: nos.join(' > ') };
}

async function medir(client, vetor) {
  const tempos = [];
  let ultimo;
  await explain(client, vetor); // aquecimento
  for (let i = 0; i < REPS; i++) {
    ultimo = await explain(client, vetor);
    tempos.push(ultimo.exec);
  }
  tempos.sort((a, b) => a - b);
  return { mediana: tempos[Math.floor(REPS / 2)], plan: ultimo.plan };
}

const client = await pool.connect();
try {
  const { rows: c } = await client.query('SELECT count(*)::int n FROM mapeamento_embedding');
  console.log(`Registros com embedding: ${c[0].n} | provedor: ${providerName()}`);
  if (c[0].n < 5000) console.log('AVISO: menos de 5000 embeddings; rode "node src/embed.js" antes para um benchmark representativo.');
  const [v] = await embedTextos([consulta], 'query');
  const vetor = toVector(v);

  // Com índice HNSW
  await client.query('ANALYZE mapeamento_embedding');
  await client.query('SET hnsw.ef_search = 40');
  // Com ~5 mil linhas o planner costuma preferir o scan sequencial; forçamos o uso do índice só para medi-lo.
  await client.query('SET enable_seqscan = off');
  const comIdx = await medir(client, vetor);

  // Sem índice: transação com DROP INDEX revertida (ROLLBACK) -> índice permanece intacto
  await client.query('BEGIN');
  await client.query('DROP INDEX idx_embedding_hnsw');
  const semIdx = await medir(client, vetor);
  await client.query('ROLLBACK');

  console.log(`\nConsulta: "${consulta}"  (top-5 por cosseno, mediana de ${REPS} execuções)`);
  console.log(`\nCOM índice HNSW : ${comIdx.mediana.toFixed(3)} ms\n  plano: ${comIdx.plan}`);
  console.log(`SEM índice      : ${semIdx.mediana.toFixed(3)} ms\n  plano: ${semIdx.plan}`);
  console.log(`\nSpeedup: ${(semIdx.mediana / comIdx.mediana).toFixed(1)}x`);
  console.log('Obs.: o HNSW é aproximado (ANN); o scan sequencial é exato. Em bases pequenas o ganho é modesto e cresce com o volume.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Falha no benchmark:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await close();
}
