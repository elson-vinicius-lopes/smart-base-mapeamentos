# Smart-Base · Catálogo de Mapeamentos de Documentos Fiscais

Trabalho de **Banco de Dados II** · UNIFACVEST · Prof. Willen Leolatto Carneiro  
MVP de **backend e persistência** (sem frontend) · **Trilha C: RAG com pgvector**

> Todos os dados são **100% fictícios** (clientes "Cliente Alfa…", CNPJs com prefixo `99999`, regras genéricas inventadas).

## O que é

Um catálogo de conhecimento em que cada **Mapeamento** descreve como transformar um documento de origem
(NF-e, CT-e, mensagem MQSeries, IDOC…) em um XML de destino, com um texto longo de regras e problemas conhecidos.
O diferencial é a **recuperação inteligente**: dado o texto de um problema atual, encontrar mapeamentos/chamados
antigos *parecidos* — mesmo sem as mesmas palavras — usando embeddings e busca por similaridade no PostgreSQL.

## Pré-requisitos

- Docker + Docker Compose v2 (Docker Desktop no Windows, ou Docker Engine no WSL)
- Node.js 22 a 24
- Git

## Passo a passo (do zero)

```bash
git clone <url-do-repositorio> smart-base-mapeamentos
cd smart-base-mapeamentos
cp .env.example .env              # PowerShell: Copy-Item .env.example .env

docker compose --profile ollama up -d   # Postgres 16 + pgvector, pgAdmin e Ollama (embeddings reais)
docker exec smartbase-ollama ollama pull nomic-embed-text   # ~270 MB, uma única vez

npm install
node src/migrate.js               # cria extensão, tabelas, constraints e índices
node src/seed.js                  # 5000 mapeamentos + 2500 chamados (~2 s)
node src/embed.js                 # gera e grava os embeddings (veja nota de tempo)
node src/search.js "campo de data chegando em formato errado"
```

**Sem GPU / sem Ollama?** Use o modo fake: no `.env` coloque `EMBED_PROVIDER=fake` e suba só
`docker compose up -d`. Os embeddings saem em segundos (hash determinístico, sem chave). **Atenção:** o modo fake
casa palavras em comum, mas **não entende sinônimos** — a demonstração "semântica supera palavra exata" só é
válida com o Ollama.

> **Tempo do `embed`:** com o Ollama em CPU, 5000 textos levam por volta de 40 min (≈115 textos/min medidos
> em CPU compartilhada). Com GPU é bem mais rápido. É retomável: se interromper, rode de novo e ele só processa o que falta
> (`--force` refaz tudo). Ajuste `SEED_MAPEAMENTOS` para uma base menor, se quiser.

Serviços: Postgres em `localhost:5432`, pgAdmin em <http://localhost:5050> (login do `.env`; servidor:
host `db`, porta `5432`), Ollama em `localhost:11434`.

### Scripts npm

| Comando | O que faz |
|---|---|
| `npm run migrate` | aplica `sql/init.sql` (usa `EMBED_DIM` na coluna `vector(N)`) |
| `npm run seed` | recria os dados fictícios (reprodutível, `faker.seed`) |
| `npm run embed` | gera embeddings dos mapeamentos que ainda não têm |
| `npm run search -- "texto"` | top 5 semântico × palavra-chave |
| `npm run ask -- "pergunta"` | mini-RAG |
| `npm run bench` | EXPLAIN ANALYZE com e sem índice vetorial |

## Modelo relacional (DER)

```mermaid
erDiagram
    AUTOR ||--o{ MAPEAMENTO : escreve
    CATEGORIA ||--o{ MAPEAMENTO : classifica
    CLIENTE ||--o{ MAPEAMENTO : "é dono de"
    TIPO_DOCUMENTO ||--o{ MAPEAMENTO : "origem de"
    MAPEAMENTO ||--o{ MAPEAMENTO_TAG : possui
    TAG ||--o{ MAPEAMENTO_TAG : rotula
    MAPEAMENTO ||--o{ CHAMADO_PROBLEMA : "recebe"
    AUTOR ||--o{ CHAMADO_PROBLEMA : abre
    MAPEAMENTO ||--o| MAPEAMENTO_EMBEDDING : "tem vetor"

    AUTOR { int id PK
            string nome
            string email UK }
    CATEGORIA { int id PK
                string nome UK
                text descricao }
    CLIENTE { int id PK
              string nome UK
              char14 cnpj UK
              bool ativo }
    TIPO_DOCUMENTO { int id PK
                     string codigo UK
                     string descricao }
    MAPEAMENTO { int id PK
                 string titulo
                 text descricao
                 text regras_texto
                 string status
                 timestamptz criado_em
                 int autor_id FK
                 int categoria_id FK
                 int cliente_id FK
                 int tipo_documento_id FK
                 tsvector busca_tsv }
    TAG { int id PK
          string nome UK }
    MAPEAMENTO_TAG { int mapeamento_id PK_FK
                     int tag_id PK_FK }
    CHAMADO_PROBLEMA { int id PK
                       int mapeamento_id FK
                       int autor_id FK
                       string titulo
                       text problema_texto
                       text solucao_texto
                       string status
                       timestamptz criado_em }
    MAPEAMENTO_EMBEDDING { int mapeamento_id PK_FK
                           text conteudo
                           vector embedding
                           timestamptz atualizado_em }
```

### Decisões de normalização (3FN)

- **Sem redundância de entidades:** autor, categoria, cliente e tipo de documento viram tabelas próprias; o
  mapeamento guarda apenas FKs (`ON DELETE RESTRICT` para não apagar histórico por acidente).
- **N:N resolvido** com `mapeamento_tag` (PK composta `(mapeamento_id, tag_id)`), em vez de lista de tags em texto.
- **Chamados** dependem de um mapeamento (`ON DELETE CASCADE`) e de um autor; todos os atributos dependem só da PK.
- **Constraints:** `UNIQUE` (e-mail, CNPJ, código, nome da tag), `CHECK` de status, `CHECK` do CNPJ (14 dígitos) e
  `CHECK` de que um chamado *resolvido* precisa ter solução.
- **Vetores separados** em `mapeamento_embedding` (1:1): o texto indexado e o vetor podem ser regerados (troca de
  modelo) sem tocar nos dados de negócio, e a dimensão fica isolada numa tabela.
- **Índices:** um por FK; **GIN** em `busca_tsv` (coluna gerada, `to_tsvector('portuguese', …)`) como busca por palavra-chave;
  **HNSW** (`vector_cosine_ops`) na coluna do vetor.

## Trilha C — RAG com pgvector

1. **Indexação:** `embed.js` concatena `título + descrição + regras` de cada mapeamento, gera o embedding
   (Ollama `nomic-embed-text`, 768 dimensões) e grava em `mapeamento_embedding.embedding vector(768)`.
2. **Recuperação:** a pergunta vira um vetor e o Postgres devolve os vizinhos mais próximos por
   **distância de cosseno** (`ORDER BY embedding <=> $1`), acelerada pelo índice **HNSW**.
3. **Geração (RAG):** `ask.js` monta um prompt com os top-k mapeamentos (+ chamados resolvidos, com a solução) e
   pede a um LLM local (Ollama) a resposta. Sem modelo de chat, imprime o contexto montado.

O provedor é configurável no `.env` (`EMBED_PROVIDER=ollama|fake`, `EMBED_DIM`). Nenhuma chave paga é exigida.

## Exemplos de busca

Comando: `node src/search.js "<consulta>"` (Ollama + `nomic-embed-text`, 5000 mapeamentos). Resumo do que se observa:

| # | Consulta | Semântica (pgvector) | Palavra-chave (tsvector, AND) |
|---|---|---|---|
| 1 | `campo de data chegando em formato errado` | top 5 = "Conversão de formato de data…" (similaridade ≈ 0,76) | também acha (compartilha palavras), mas **0** ocorrências da frase exata |
| 2 | `o documento é recusado porque o total não fecha com os itens` | top 4 = "Soma dos tributos no total do documento…" (≈ 0,78); entra também "Quebra de documento com mais de 990 itens" | **0 resultados** |
| 3 | `o serviço trava por falta de memória com arquivo enorme` | top 5 = "Consumo de memória ao processar arquivos extensos…" (≈ 0,76) | **0 resultados** |

Nos exemplos 2 e 3 nenhum texto contém todas as palavras da consulta ("enorme" × "extensos", "não fecha" × "diferença/soma"),
então a busca por palavra-chave falha, e a semântica encontra o mapeamento certo pelo **significado**.

Mini-RAG: `node src/ask.js "como corrigir quando a nota é recusada porque a placa do veículo tem hífen?"` recupera os
mapeamentos sobre "Preenchimento de placa, motorista e peso transportado". Observação honesta: o recuperador acerta, mas o LLM
padrão `llama3.2:1b` (pequeno, em CPU) respondeu mal; use um modelo maior (`OLLAMA_CHAT_MODEL`) para respostas melhores.

## Desempenho

`node src/bench.js` (5000 vetores de 768 dimensões, top-5 por cosseno, mediana de 5 execuções de `EXPLAIN ANALYZE`):

| Cenário | Plano | Tempo |
|---|---|---|
| Com índice HNSW | `Limit > Index Scan (idx_embedding_hnsw)` | **0,72 ms** |
| Sem índice | `Limit > Sort > Seq Scan` | **38,6 ms** |

Ganho ≈ **53×**. Notas: (1) com ~5 mil linhas o planner, por padrão, escolhe o scan sequencial; o script força
`enable_seqscan=off` apenas para medir o índice; (2) o HNSW é aproximado (ANN), o scan sequencial é exato; (3) o "sem índice" é
medido com `DROP INDEX` dentro de uma transação revertida (`ROLLBACK`), então o índice permanece. Os tempos variam conforme a máquina.

## Estrutura

```
docker-compose.yml   .env.example   package.json
sql/init.sql         # extensão, tabelas, constraints, índices GIN e HNSW
src/db.js  migrate.js  seed.js  conceitos.js  embeddings.js  embed.js  search.js  ask.js  bench.js
IA_LOG.md            # prompts usados e adaptações manuais
```
