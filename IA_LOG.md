# IA_LOG — Uso de IA no projeto Smart-Base

Ferramenta: Claude Code (modelo Claude Sonnet 5.5). Registro ao final de cada etapa: prompt resumido, o que a IA gerou
e as adaptações manuais. A coluna **"Minhas anotações"** é para a dupla preencher o que ajustou/revisou por conta própria.

## Prompt-base (resumo)
> Atuar como Engenheiro de Dados/IA sênior: entregar o MVP de backend e persistência do Smart-Base (Trilha C: RAG com
> pgvector) com Docker, PostgreSQL 16, Node.js ESM sem ORM, seeder de milhares de registros fictícios, busca semântica
> × palavra-chave, mini-RAG, benchmark, README e este log; commits Conventional Commits, um por etapa; só dados
> fictícios; mostrar plano e aguardar "ok" antes de codar.

| # | Etapa | Prompt resumido | O que a IA gerou | Adaptações manuais / decisões | Minhas anotações |
|---|---|---|---|---|---|
| 1 | Projeto | "Inicialize o projeto Node ESM com .gitignore e scripts" | `package.json` (scripts migrate/seed/embed/search/ask/bench), `.gitignore` | Identidade Git configurada só neste repositório (nome/e-mail informados pela dupla). | |
| 2 | Docker | "Postgres 16 com pgvector + pgAdmin, volume, healthcheck, .env" | `docker-compose.yml`, `.env.example` | Docker não existia na máquina: foi instalado no WSL (Ubuntu 24.04) pela IA, a pedido. Adicionado serviço **Ollama** opcional (perfil `ollama`) para embeddings reais. | |
| 3 | Esquema | "Modelo 3FN com autor, categoria, cliente, tipo_documento, mapeamento, tag, N:N, chamado e embedding; HNSW e GIN português" | `sql/init.sql`, `src/db.js`, `src/migrate.js` | Dimensão do vetor injetada por `EMBED_DIM` (token `__EMBED_DIM__`). `busca_tsv` como coluna **gerada** para manter o índice GIN sempre consistente. | |
| 4 | Seeder | "Gerar 5000+ mapeamentos e 2000+ chamados com faker pt_BR, em lotes e transação, medindo o tempo" | `src/seed.js`, `src/conceitos.js` | Textos construídos a partir de 12 "conceitos" com várias paráfrases/sinônimos, para a busca semântica ter o que provar. IDs explícitos para amarrar chamados ao conceito do mapeamento. CNPJ com prefixo `99999` (claramente fictício). `faker.seed` fixa para reprodutibilidade. 5000 mapeamentos + 2500 chamados em ~1,4 s. | |
| 5 | Embeddings | "Provedor configurável: Ollama nomic-embed-text 768d ou fake determinístico" | `src/embeddings.js`, `src/embed.js` | Prefixos `search_document:`/`search_query:` exigidos pelo nomic. Modo fake por *feature hashing* de tokens: determinístico e sem chave, porém **não semântico** (documentado). `embed` retomável (só o que falta; `--force` refaz). Gerar 5000 embeddings em CPU levou ~40 min. | |
| 6 | Busca | "Top 5 por cosseno lado a lado com palavra-chave" | `src/search.js` | Palavra-chave com `plainto_tsquery('portuguese')` (AND de todos os termos) + contagem de frase exata por `ILIKE`. | |
| 7 | RAG | "Recuperar top-k, montar prompt, gerar resposta se houver LLM" | `src/ask.js` | Inclui chamados resolvidos (problema + solução) do mapeamento recuperado no contexto. Degrada para imprimir o contexto se não houver modelo de chat. | |
| 8 | Benchmark | "Comparar tempo com e sem índice vetorial via EXPLAIN ANALYZE" | `src/bench.js` | O "sem índice" faz `DROP INDEX` dentro de transação e dá `ROLLBACK`, então o índice permanece. | |
| 9 | Docs | "README com passo a passo, DER Mermaid, normalização, trilha C" | `README.md`, este log | Resultados reais colados após a execução. | |

## Verificação final (teste completo)
Ambiente zerado (volumes apagados, `node_modules` e `.env` removidos) e README seguido à risca:
- `docker compose --profile ollama up -d`, `ollama pull`, `npm install`, `migrate`, `seed`, `embed`, `search`, `ask`, `bench`: tudo sem erro.
- 18 verificações de integridade (CNPJ inválido, UNIQUE, CHECK de status, FK inexistente, chamado resolvido sem solução, PK composta duplicada, vetor de dimensão errada, RESTRICT e CASCADE) em transação com ROLLBACK: 18 ok.
- `embed` interrompido após 160 registros e retomado: processou só os 4840 faltantes e concluiu (5000).
- `ask` nos 3 caminhos: com LLM, sem modelo de chat instalado e com Ollama fora do ar (imprime o contexto); `search`/`ask` sem argumento retornam uso e exit 1.
- pgAdmin: login com as credenciais do `.env` e cadastro do servidor `db:5432` funcionaram.
- **Defeito achado e corrigido:** o DER Mermaid do README tinha sintaxe inválida (validado com `mermaid.parse`).
- Não testado: Docker Desktop nativo no Windows (testado com Docker Engine no WSL).

## Observações gerais
- A IA executou os comandos de verdade (Docker no WSL, migrate, seed, embed, search) e corrigiu o que falhou.
- Pontos para revisão humana: textos dos conceitos (`src/conceitos.js`), escolha do HNSW vs IVFFlat, parâmetros do benchmark.

## Anotações da dupla (livre)
-
-
