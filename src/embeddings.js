import 'dotenv/config';
import { createHash } from 'node:crypto';
import { EMBED_DIM } from './db.js';

const PROVIDER = (process.env.EMBED_PROVIDER ?? 'ollama').toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';

export const providerName = () => (PROVIDER === 'fake' ? 'fake (hash determinístico)' : `ollama/${OLLAMA_MODEL}`);

function normalizar(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

// Modo "fake": determinístico, sem GPU e sem chave. Cada token é espalhado no vetor por hash (feature hashing).
// ATENÇÃO: NÃO é semântico de verdade — textos com as mesmas palavras ficam próximos, sinônimos não.
function fakeEmbed(texto) {
  const v = new Array(EMBED_DIM).fill(0);
  const tokens = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  for (const t of tokens.length ? tokens : [texto]) {
    const h = createHash('sha256').update(t).digest();
    for (let k = 0; k < 4; k++) {
      const idx = h.readUInt16BE(k * 2) % EMBED_DIM;
      v[idx] += h[8 + k] & 1 ? 1 : -1;
    }
  }
  return normalizar(v);
}

async function ollamaEmbed(textos) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, input: textos }),
  }).catch((e) => {
    throw new Error(`Ollama inacessível em ${OLLAMA_URL} (${e.cause?.code ?? e.message}). ` +
      'Suba com "docker compose --profile ollama up -d" ou use EMBED_PROVIDER=fake no .env.');
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}: ${await res.text()}`);
  const { embeddings } = await res.json();
  if (embeddings[0].length !== EMBED_DIM) {
    throw new Error(`Dimensão ${embeddings[0].length} do modelo difere de EMBED_DIM=${EMBED_DIM}.`);
  }
  return embeddings;
}

// tipo: 'document' (para indexar) ou 'query' (para buscar). O nomic-embed-text usa prefixos de tarefa.
export async function embedTextos(textos, tipo = 'document') {
  if (PROVIDER === 'fake') return textos.map(fakeEmbed);
  const prefixo = tipo === 'query' ? 'search_query: ' : 'search_document: ';
  return ollamaEmbed(textos.map((t) => prefixo + t));
}

export const toVector = (v) => `[${v.join(',')}]`;
