import { pool, close } from './db.js';
import { embedTextos, toVector, providerName } from './embeddings.js';

const pergunta = process.argv.slice(2).join(' ').trim();
if (!pergunta) {
  console.error('Uso: node src/ask.js "pergunta"');
  process.exit(1);
}

const K = parseInt(process.env.RAG_TOP_K ?? '3', 10);
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL ?? 'llama3.2:1b';

async function recuperar(texto) {
  const [vetor] = await embedTextos([texto], 'query');
  const { rows } = await pool.query(
    `SELECT m.id, m.titulo, m.descricao, m.regras_texto, 1 - (e.embedding <=> $1::vector) AS score
       FROM mapeamento_embedding e JOIN mapeamento m ON m.id = e.mapeamento_id
      ORDER BY e.embedding <=> $1::vector
      LIMIT $2`,
    [toVector(vetor), K]
  );
  for (const r of rows) {
    const { rows: ch } = await pool.query(
      `SELECT problema_texto, solucao_texto FROM chamado_problema
        WHERE mapeamento_id = $1 AND solucao_texto IS NOT NULL ORDER BY criado_em DESC LIMIT 2`,
      [r.id]
    );
    r.chamados = ch;
  }
  return rows;
}

function montarPrompt(pergunta, docs) {
  const contexto = docs
    .map((d, i) => {
      const ch = d.chamados.map((c) => `  - Problema: ${c.problema_texto}\n    Solução: ${c.solucao_texto}`).join('\n');
      return `[${i + 1}] Mapeamento #${d.id}: ${d.titulo}\n${d.descricao}\n${d.regras_texto}` +
        (ch ? `\nChamados resolvidos:\n${ch}` : '');
    })
    .join('\n\n');
  return `Você é um assistente da Smart-Base. Responda em português usando SOMENTE o contexto abaixo. ` +
    `Cite o número do mapeamento usado. Se o contexto não bastar, diga isso.\n\n` +
    `### Contexto\n${contexto}\n\n### Pergunta\n${pergunta}\n\n### Resposta`;
}

async function gerar(prompt) {
  try {
    const tags = await fetch(`${OLLAMA_URL}/api/tags`).then((r) => r.json());
    if (!tags.models?.some((m) => m.name === CHAT_MODEL || m.name === `${CHAT_MODEL}:latest`)) {
      return { erro: `modelo de chat "${CHAT_MODEL}" não instalado (ollama pull ${CHAT_MODEL})` };
    }
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CHAT_MODEL, stream: false, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return { erro: `Ollama respondeu ${res.status}` };
    return { texto: (await res.json()).message.content };
  } catch (e) {
    return { erro: `Ollama indisponível (${e.cause?.code ?? e.message})` };
  }
}

try {
  console.log(`Pergunta: "${pergunta}"\nProvedor de embeddings: ${providerName()}\n`);
  const docs = await recuperar(pergunta);
  console.log('Documentos recuperados (top-k por similaridade de cosseno):');
  docs.forEach((d) => console.log(`  - #${d.id} ${d.titulo} (similaridade ${Number(d.score).toFixed(3)})`));

  const prompt = montarPrompt(pergunta, docs);
  const r = await gerar(prompt);
  if (r.texto) {
    console.log(`\n=== Resposta (${CHAT_MODEL}) ===\n${r.texto}`);
  } else {
    console.log(`\n(Sem geração: ${r.erro}.) Contexto montado para o LLM:\n`);
    console.log('----------------------------------------\n' + prompt + '\n----------------------------------------');
  }
} catch (err) {
  console.error('Falha no RAG:', err.message);
  process.exitCode = 1;
} finally {
  await close();
}
