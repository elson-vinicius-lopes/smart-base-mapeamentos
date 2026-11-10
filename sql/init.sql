-- Smart-Base: esquema relacional (3FN) + pgvector (Trilha C)
-- O token __EMBED_DIM__ é substituído por src/migrate.js (variável EMBED_DIM).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS autor (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    email       VARCHAR(160) NOT NULL UNIQUE,
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categoria (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(80) NOT NULL UNIQUE,
    descricao   TEXT
);

CREATE TABLE IF NOT EXISTS cliente (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL UNIQUE,
    cnpj        CHAR(14)     NOT NULL UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
    ativo       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tipo_documento (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(20)  NOT NULL UNIQUE,
    descricao   VARCHAR(160) NOT NULL
);

CREATE TABLE IF NOT EXISTS mapeamento (
    id                 SERIAL PRIMARY KEY,
    titulo             VARCHAR(200) NOT NULL,
    descricao          TEXT         NOT NULL,
    regras_texto       TEXT         NOT NULL,
    status             VARCHAR(20)  NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','em_revisao','publicado','obsoleto')),
    criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    autor_id           INT NOT NULL REFERENCES autor(id)          ON DELETE RESTRICT,
    categoria_id       INT NOT NULL REFERENCES categoria(id)      ON DELETE RESTRICT,
    cliente_id         INT NOT NULL REFERENCES cliente(id)        ON DELETE RESTRICT,
    tipo_documento_id  INT NOT NULL REFERENCES tipo_documento(id) ON DELETE RESTRICT,
    busca_tsv          tsvector GENERATED ALWAYS AS (
        to_tsvector('portuguese',
            coalesce(titulo,'') || ' ' || coalesce(descricao,'') || ' ' || coalesce(regras_texto,''))
    ) STORED
);

CREATE TABLE IF NOT EXISTS tag (
    id    SERIAL PRIMARY KEY,
    nome  VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS mapeamento_tag (
    mapeamento_id INT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
    tag_id        INT NOT NULL REFERENCES tag(id)        ON DELETE CASCADE,
    PRIMARY KEY (mapeamento_id, tag_id)
);

CREATE TABLE IF NOT EXISTS chamado_problema (
    id             SERIAL PRIMARY KEY,
    mapeamento_id  INT NOT NULL REFERENCES mapeamento(id) ON DELETE CASCADE,
    autor_id       INT NOT NULL REFERENCES autor(id)      ON DELETE RESTRICT,
    titulo         VARCHAR(200) NOT NULL,
    problema_texto TEXT NOT NULL,
    solucao_texto  TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'aberto'
                   CHECK (status IN ('aberto','em_analise','resolvido')),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'resolvido' OR solucao_texto IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS mapeamento_embedding (
    mapeamento_id INT PRIMARY KEY REFERENCES mapeamento(id) ON DELETE CASCADE,
    conteudo      TEXT NOT NULL,
    embedding     vector(__EMBED_DIM__) NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de apoio às FKs e filtros
CREATE INDEX IF NOT EXISTS idx_mapeamento_autor     ON mapeamento(autor_id);
CREATE INDEX IF NOT EXISTS idx_mapeamento_categoria ON mapeamento(categoria_id);
CREATE INDEX IF NOT EXISTS idx_mapeamento_cliente   ON mapeamento(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapeamento_tipodoc   ON mapeamento(tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_mapeamento_status    ON mapeamento(status);
CREATE INDEX IF NOT EXISTS idx_mapeamento_tag_tag   ON mapeamento_tag(tag_id);
CREATE INDEX IF NOT EXISTS idx_chamado_mapeamento   ON chamado_problema(mapeamento_id);
CREATE INDEX IF NOT EXISTS idx_chamado_autor        ON chamado_problema(autor_id);

-- Full-text em português (fallback / comparação com a busca semântica)
CREATE INDEX IF NOT EXISTS idx_mapeamento_busca_gin ON mapeamento USING GIN (busca_tsv);

-- Índice vetorial HNSW por distância de cosseno
CREATE INDEX IF NOT EXISTS idx_embedding_hnsw
    ON mapeamento_embedding USING hnsw (embedding vector_cosine_ops);
