import { pool, close } from './db.js';
import { embedTextos, toVector, providerName } from './embeddings.js';

const consulta = process.argv.slice(2).join(' ').trim();
if (!consulta) {
  console.error('Uso: node src/search.js "texto do problema"');
  process.exit(1);
}

const cortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function buscaSemantica(texto, k = 5) {
  const [vetor] = await embedTextos([texto], 'query');
  const { rows } = await pool.query(
    `SELECT m.id, m.titulo, 1 - (e.embedding <=> $1::vector) AS score
       FROM mapeamento_embedding e
       JOIN mapeamento m ON m.id = e.mapeamento_id
      ORDER BY e.embedding <=> $1::vector
      LIMIT $2`,
    [toVector(vetor), k]
  );
  return rows;
}

export async function buscaPalavraChave(texto, k = 5) {
  // AND de todos os termos (stemming em português) -> só acha quem contém TODAS as palavras
  const { rows } = await pool.query(
    `SELECT m.id, m.titulo, ts_rank(m.busca_tsv, q) AS score
       FROM mapeamento m, plainto_tsquery('portuguese', $1) q
      WHERE m.busca_tsv @@ q
      ORDER BY score DESC
      LIMIT $2`,
    [texto, k]
  );
  const { rows: exata } = await pool.query(
    `SELECT count(*)::int AS n FROM mapeamento WHERE titulo ILIKE $1 OR descricao ILIKE $1 OR regras_texto ILIKE $1`,
    [`%${texto}%`]
  );
  return { rows, frase_exata: exata[0].n };
}

function imprimir(titulo, rows, fmt) {
  console.log(`\n${titulo}`);
  if (!rows.length) return console.log('  (nenhum resultado)');
  rows.forEach((r, i) => console.log(`  ${i + 1}. [#${r.id}] ${cortar(r.titulo, 70)}  ${fmt(r.score)}`));
}

async function main() {
  console.log(`Consulta: "${consulta}"`);
  console.log(`Provedor de embeddings: ${providerName()}`);
  let t = performance.now();
  const sem = await buscaSemantica(consulta);
  const tSem = performance.now() - t;
  t = performance.now();
  const kw = await buscaPalavraChave(consulta);
  const tKw = performance.now() - t;

  imprimir(`>>> SEMÂNTICA (pgvector, cosseno <=>)  [${tSem.toFixed(0)} ms]`, sem, (s) => `similaridade=${Number(s).toFixed(3)}`);
  imprimir(`>>> PALAVRA-CHAVE (tsvector português, AND)  [${tKw.toFixed(0)} ms]`, kw.rows, (s) => `rank=${Number(s).toFixed(3)}`);
  console.log(`  Frase exata (ILIKE) encontrada em ${kw.frase_exata} registro(s).`);
  console.log(`\nResumo: semântica=${sem.length} resultados | palavra-chave=${kw.rows.length} resultados`);
}

try {
  await main();
} catch (err) {
  console.error('Falha na busca:', err.message);
  process.exitCode = 1;
} finally {
  await close();
}
