import { fakerPT_BR as faker } from '@faker-js/faker';
import { pool, close } from './db.js';
import { CONCEITOS, TIPOS_DOCUMENTO, CATEGORIAS, STATUS } from './conceitos.js';

const N_MAPEAMENTOS = parseInt(process.env.SEED_MAPEAMENTOS ?? '5000', 10);
const N_CHAMADOS = parseInt(process.env.SEED_CHAMADOS ?? '2500', 10);
const N_AUTORES = 60;
const N_CLIENTES = 40;
const LOTE = 500;

faker.seed(20261110); // dados reproduzíveis

const GREGO = ['Alfa', 'Beta', 'Gama', 'Delta', 'Épsilon', 'Zeta', 'Eta', 'Teta', 'Iota', 'Capa', 'Lambda', 'Mi',
  'Ni', 'Csi', 'Ômicron', 'Pi', 'Rô', 'Sigma', 'Tau', 'Ípsilon', 'Fi', 'Qui', 'Psi', 'Ômega'];
const CAMPOS = ['dtEmissao', 'vlTotal', 'cdOperacao', 'nrDocumento', 'txObservacao', 'qtItem', 'cdProduto',
  'idEmitente', 'idDestinatario', 'vlFrete', 'nrPlaca', 'cdMunicipio', 'vlDesconto', 'nrSerie', 'cdPais'];
const ELEMENTOS = ['dhEmi', 'vNF', 'CFOP', 'nNF', 'infAdFisco', 'qCom', 'cProd', 'CNPJ', 'xNome', 'vFrete',
  'placa', 'cMun', 'vDesc', 'serie', 'cPais'];
const TAGS_EXTRA = ['legado', 'critico', 'homologado', 'em-producao', 'revisar', 'lote', 'exportacao', 'devolucao'];

const pick = (arr) => faker.helpers.arrayElement(arr);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

async function insertLote(client, sql, cols) {
  await client.query(sql, cols);
}

async function main() {
  const t0 = performance.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `TRUNCATE mapeamento_embedding, chamado_problema, mapeamento_tag, mapeamento, tag,
                tipo_documento, cliente, categoria, autor RESTART IDENTITY CASCADE`
    );

    // Dimensões
    await client.query(
      `INSERT INTO tipo_documento (codigo, descricao) SELECT * FROM unnest($1::text[], $2::text[])`,
      [TIPOS_DOCUMENTO.map((t) => t[0]), TIPOS_DOCUMENTO.map((t) => t[1])]
    );
    await client.query(
      `INSERT INTO categoria (nome, descricao) SELECT n, 'Mapeamentos relacionados a ' || lower(n) FROM unnest($1::text[]) n`,
      [CATEGORIAS]
    );
    const tagNomes = [...CONCEITOS.map((c) => c.tag), ...TAGS_EXTRA];
    await client.query(`INSERT INTO tag (nome) SELECT unnest($1::text[])`, [tagNomes]);

    const autores = Array.from({ length: N_AUTORES }, (_, i) => ({
      nome: faker.person.fullName(),
      email: `autor${i + 1}@exemplo.com.br`,
    }));
    await client.query(`INSERT INTO autor (nome, email) SELECT * FROM unnest($1::text[], $2::text[])`, [
      autores.map((a) => a.nome), autores.map((a) => a.email),
    ]);

    const clientes = Array.from({ length: N_CLIENTES }, (_, i) => ({
      nome: `Cliente ${GREGO[i % GREGO.length]}${i >= GREGO.length ? ' ' + (Math.floor(i / GREGO.length) + 1) : ''}`,
      cnpj: `99999${String(i + 1).padStart(9, '0')}`, // prefixo 99999: claramente fictício
    }));
    await client.query(`INSERT INTO cliente (nome, cnpj) SELECT * FROM unnest($1::text[], $2::text[])`, [
      clientes.map((c) => c.nome), clientes.map((c) => c.cnpj),
    ]);

    // Mapeamentos
    const mapConceito = new Array(N_MAPEAMENTOS + 1); // id -> índice do conceito
    const rows = [];
    for (let id = 1; id <= N_MAPEAMENTOS; id++) {
      const ci = faker.number.int({ min: 0, max: CONCEITOS.length - 1 });
      mapConceito[id] = ci;
      const c = CONCEITOS[ci];
      const tipoIdx = faker.number.int({ min: 0, max: TIPOS_DOCUMENTO.length - 1 });
      const clienteIdx = faker.number.int({ min: 0, max: N_CLIENTES - 1 });
      const campo = faker.number.int({ min: 0, max: CAMPOS.length - 1 });
      const regras = faker.helpers.arrayElements(c.regras, { min: 2, max: c.regras.length });
      const probs = faker.helpers.arrayElements(c.problemas, { min: 1, max: 2 });
      const titulo = `${pick(c.titulos)} - ${TIPOS_DOCUMENTO[tipoIdx][0]} ${clientes[clienteIdx].nome}`;
      const descricao =
        `Mapeamento de ${TIPOS_DOCUMENTO[tipoIdx][1]} para o XML de destino do ${clientes[clienteIdx].nome}. ` +
        `${regras[0]}`;
      const regras_texto = [
        `Origem: campo ${CAMPOS[campo]} -> Destino: elemento ${ELEMENTOS[campo]}.`,
        ...regras,
        `Problemas conhecidos: ${probs.join(' ')}`,
        `Versão ${faker.number.int({ min: 1, max: 9 })}.${faker.number.int({ min: 0, max: 20 })} revisada por ` +
          `${faker.person.firstName()} em ${faker.date.past({ years: 3 }).toISOString().slice(0, 10)}.`,
      ].join('\n\n');
      rows.push({
        id, titulo, descricao, regras_texto,
        status: pick(STATUS),
        criado_em: faker.date.past({ years: 3 }).toISOString(),
        autor_id: faker.number.int({ min: 1, max: N_AUTORES }),
        categoria_id: (ci % CATEGORIAS.length) + 1,
        cliente_id: clienteIdx + 1,
        tipo_documento_id: tipoIdx + 1,
      });
    }

    for (let i = 0; i < rows.length; i += LOTE) {
      const l = rows.slice(i, i + LOTE);
      const col = (k) => l.map((r) => r[k]);
      await insertLote(
        client,
        `INSERT INTO mapeamento (id, titulo, descricao, regras_texto, status, criado_em,
                                 autor_id, categoria_id, cliente_id, tipo_documento_id)
         SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[],
                              $7::int[], $8::int[], $9::int[], $10::int[])`,
        [col('id'), col('titulo'), col('descricao'), col('regras_texto'), col('status'), col('criado_em'),
          col('autor_id'), col('categoria_id'), col('cliente_id'), col('tipo_documento_id')]
      );
    }
    await client.query(`SELECT setval(pg_get_serial_sequence('mapeamento','id'), $1)`, [N_MAPEAMENTOS]);

    // Tags (N:N): a tag do conceito + 0..2 extras
    const tagIds = new Map(tagNomes.map((n, i) => [n, i + 1]));
    const vinculos = [];
    for (let id = 1; id <= N_MAPEAMENTOS; id++) {
      const set = new Set([tagIds.get(CONCEITOS[mapConceito[id]].tag)]);
      for (const t of faker.helpers.arrayElements(TAGS_EXTRA, { min: 0, max: 2 })) set.add(tagIds.get(t));
      for (const t of set) vinculos.push([id, t]);
    }
    for (let i = 0; i < vinculos.length; i += LOTE * 4) {
      const l = vinculos.slice(i, i + LOTE * 4);
      await client.query(`INSERT INTO mapeamento_tag (mapeamento_id, tag_id) SELECT * FROM unnest($1::int[], $2::int[])`,
        [l.map((v) => v[0]), l.map((v) => v[1])]);
    }

    // Chamados de problema
    const chamados = [];
    for (let i = 0; i < N_CHAMADOS; i++) {
      const mid = faker.number.int({ min: 1, max: N_MAPEAMENTOS });
      const c = CONCEITOS[mapConceito[mid]];
      const resolvido = faker.datatype.boolean(0.7);
      chamados.push({
        mapeamento_id: mid,
        autor_id: faker.number.int({ min: 1, max: N_AUTORES }),
        titulo: `Chamado: ${cap(pick(c.problemas).split(' ').slice(0, 9).join(' '))}...`,
        problema_texto: `${pick(c.problemas)} Ocorreu no ambiente de ${pick(['homologação', 'produção'])} ` +
          `com o lote ${faker.string.alphanumeric({ length: 8, casing: 'upper' })}.`,
        solucao_texto: resolvido ? pick(c.solucoes) : null,
        status: resolvido ? 'resolvido' : pick(['aberto', 'em_analise']),
        criado_em: faker.date.past({ years: 2 }).toISOString(),
      });
    }
    for (let i = 0; i < chamados.length; i += LOTE) {
      const l = chamados.slice(i, i + LOTE);
      const col = (k) => l.map((r) => r[k]);
      await client.query(
        `INSERT INTO chamado_problema (mapeamento_id, autor_id, titulo, problema_texto, solucao_texto, status, criado_em)
         SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[])`,
        [col('mapeamento_id'), col('autor_id'), col('titulo'), col('problema_texto'), col('solucao_texto'),
          col('status'), col('criado_em')]
      );
    }

    await client.query('COMMIT');
    const { rows: r } = await client.query(
      `SELECT (SELECT count(*) FROM mapeamento)::int m, (SELECT count(*) FROM chamado_problema)::int c,
              (SELECT count(*) FROM mapeamento_tag)::int t`
    );
    const seg = ((performance.now() - t0) / 1000).toFixed(2);
    console.log(`Seed concluído: ${r[0].m} mapeamentos, ${r[0].c} chamados, ${r[0].t} vínculos de tag em ${seg}s`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Falha no seed (rollback feito):', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await close();
  }
}

main();
