// Conceitos fictícios de mapeamento. Cada conceito tem várias formas de dizer a mesma coisa
// (sinônimos/paráfrases) para que a busca semântica tenha algo a provar frente à palavra exata.
// Tudo genérico e inventado: nenhuma regra, layout ou código de cliente real.

export const CONCEITOS = [
  {
    tag: 'data',
    titulos: [
      'Conversão de formato de data',
      'Normalização do padrão de datas para ISO 8601',
      'Ajuste de timestamp de emissão para o XML de destino',
    ],
    regras: [
      'A data de emissão chega como DDMMAAAA e deve ser convertida para AAAA-MM-DD antes de gravar no XML.',
      'Todo carimbo temporal de origem precisa ser reescrito no padrão ISO 8601 com fuso horário explícito.',
      'Datas sem separador são fatiadas por posição e remontadas com hífens; valores inválidos geram rejeição.',
    ],
    problemas: [
      'O sistema de destino recusa o documento porque a data aparece invertida, com dia e mês trocados.',
      'Registros antigos trazem o ano com dois dígitos e o XML sai com século errado.',
      'Notas emitidas perto da meia-noite saem com o dia anterior por causa do fuso.',
    ],
    solucoes: [
      'Aplicar a máscara de conversão antes da validação e tratar o ano de dois dígitos com janela de século.',
      'Normalizar tudo para UTC e só então formatar com o deslocamento do fuso do emitente.',
    ],
  },
  {
    tag: 'decimal',
    titulos: [
      'Tratamento de separador decimal e casas de precisão',
      'Arredondamento de valores monetários no destino',
      'Conversão de vírgula para ponto em campos numéricos',
    ],
    regras: [
      'Valores monetários chegam com vírgula decimal e devem sair com ponto e exatamente duas casas.',
      'Quantidades comerciais aceitam até quatro casas; o excedente é arredondado para cima na quinta casa.',
      'Campos numéricos são limpos de separador de milhar antes da conversão.',
    ],
    problemas: [
      'O total do documento difere em um centavo da soma dos itens após a transformação.',
      'O destino interpreta 1.250,00 como mil duzentos e cinquenta mil por causa do ponto de milhar.',
      'Valores com muitas casas são truncados em vez de arredondados.',
    ],
    solucoes: [
      'Remover separador de milhar, trocar a vírgula e arredondar apenas no total, distribuindo a diferença no último item.',
      'Usar aritmética decimal exata em vez de ponto flutuante durante a conversão.',
    ],
  },
  {
    tag: 'cnpj',
    titulos: [
      'Máscara e validação de identificador do contribuinte',
      'Remoção de pontuação em CNPJ e CPF',
      'Preenchimento de zeros à esquerda em documentos de identificação',
    ],
    regras: [
      'O identificador fiscal deve ser enviado apenas com dígitos, sem pontos, barras ou traços.',
      'Identificadores com menos de catorze dígitos recebem zeros à esquerda; o dígito verificador é recalculado.',
      'Quando o destinatário é pessoa física, o campo de CNPJ é omitido e o de CPF é preenchido.',
    ],
    problemas: [
      'O XML é rejeitado porque o número do emitente chega com pontuação.',
      'Zeros à esquerda se perdem quando o campo é tratado como número inteiro.',
      'O dígito verificador não confere e o lote inteiro é devolvido.',
    ],
    solucoes: [
      'Tratar o identificador sempre como texto, limpar caracteres não numéricos e validar o dígito verificador.',
      'Completar com zeros à esquerda via função de preenchimento antes de montar o elemento.',
    ],
  },
  {
    tag: 'encoding',
    titulos: [
      'Correção de codificação de caracteres acentuados',
      'Conversão de charset do arquivo de origem para UTF-8',
      'Tratamento de caracteres especiais em nomes e endereços',
    ],
    regras: [
      'Arquivos de origem em ISO-8859-1 são decodificados e regravados em UTF-8 antes do parse.',
      'Caracteres de controle e símbolos fora do conjunto permitido são substituídos por espaço.',
      'Entidades como ampersand e aspas são escapadas conforme o padrão XML.',
    ],
    problemas: [
      'Nomes com til e cedilha aparecem corrompidos, com símbolos estranhos no lugar das letras.',
      'O parser do destino falha ao encontrar um caractere inválido no meio da razão social.',
      'Um e comercial no endereço quebra a estrutura do XML.',
    ],
    solucoes: [
      'Detectar a codificação na leitura, converter para UTF-8 e escapar as entidades reservadas na escrita.',
      'Filtrar caracteres de controle com expressão regular antes de serializar.',
    ],
  },
  {
    tag: 'cfop',
    titulos: [
      'De-para de código de operação fiscal',
      'Tabela de equivalência de CFOP entre origem e destino',
      'Reclassificação de natureza da operação',
    ],
    regras: [
      'O código de operação de origem é traduzido por tabela de equivalência mantida pelo cliente.',
      'Operações interestaduais trocam o primeiro dígito do código de dentro para fora do estado.',
      'Códigos sem correspondência na tabela seguem para fila de tratamento manual.',
    ],
    problemas: [
      'Documentos saem com a natureza da operação errada porque o de-para está desatualizado.',
      'Operações de devolução são classificadas como venda normal.',
      'A tabela de equivalência não contempla códigos criados recentemente.',
    ],
    solucoes: [
      'Versionar a tabela de de-para e alertar quando um código desconhecido aparecer.',
      'Criar regra específica para devolução antes da regra genérica de venda.',
    ],
  },
  {
    tag: 'itens',
    titulos: [
      'Repetição de itens e limite de linhas por documento',
      'Quebra de documento com mais de 990 itens',
      'Agrupamento de linhas repetidas do detalhamento',
    ],
    regras: [
      'Cada linha de detalhe da origem vira um elemento repetido no destino, numerado a partir de 1.',
      'Documentos que excedem o limite de itens são divididos em duas ou mais notas complementares.',
      'Itens idênticos consecutivos podem ser agrupados somando a quantidade.',
    ],
    problemas: [
      'A numeração dos itens reinicia em cada página e gera duplicidade.',
      'Notas grandes são recusadas por excederem o número máximo de linhas.',
      'O total de itens declarado no cabeçalho não bate com a quantidade de linhas enviadas.',
    ],
    solucoes: [
      'Gerar a sequência com contador global e recalcular o total após o agrupamento.',
      'Dividir o documento antes do limite e replicar o cabeçalho em cada parte.',
    ],
  },
  {
    tag: 'impostos',
    titulos: [
      'Cálculo e distribuição de tributos por item',
      'Mapeamento dos grupos de ICMS, IPI e PIS',
      'Soma dos tributos no total do documento',
    ],
    regras: [
      'Cada item carrega seu grupo tributário; o total do documento é a soma dos tributos dos itens.',
      'A alíquota é lida da origem; quando ausente, aplica-se a alíquota padrão do cadastro do produto.',
      'Itens isentos recebem o grupo de não tributado com o motivo de desoneração.',
    ],
    problemas: [
      'A soma dos impostos do total difere da soma dos itens por diferença de arredondamento.',
      'Itens isentos saem com alíquota zero em vez do grupo correto.',
      'A base de cálculo vem vazia e o destino rejeita o item.',
    ],
    solucoes: [
      'Calcular a base e o valor por item, arredondar uma vez e somar os valores já arredondados.',
      'Escolher o grupo tributário pelo código de situação e não pela alíquota.',
    ],
  },
  {
    tag: 'transporte',
    titulos: [
      'Dados de transportadora e veículo no documento de transporte',
      'Preenchimento de placa, motorista e peso transportado',
      'Mapeamento do modal rodoviário para o XML de transporte',
    ],
    regras: [
      'A placa do veículo é enviada em maiúsculas e sem hífen, com a UF de licenciamento.',
      'O peso bruto é convertido de quilogramas para a unidade esperada no destino.',
      'Campos de motorista são opcionais, mas devem vir completos quando um deles for informado.',
    ],
    problemas: [
      'A placa chega com hífen e o destino considera o formato inválido.',
      'O peso aparece em toneladas em alguns registros e em quilos em outros.',
      'Documentos sem motorista são recusados mesmo quando o campo é opcional.',
    ],
    solucoes: [
      'Padronizar a placa por expressão regular e converter todas as unidades de peso para quilos.',
      'Omitir o grupo do motorista por completo quando nenhum campo estiver preenchido.',
    ],
  },
  {
    tag: 'fila',
    titulos: [
      'Leitura de mensagem de fila e confirmação de recebimento',
      'Tratamento de mensagens duplicadas na entrada da fila',
      'Reprocessamento de mensagem com falha de transformação',
    ],
    regras: [
      'Cada mensagem é lida, transformada e só então confirmada; falhas devolvem a mensagem à fila.',
      'Uma chave de idempotência evita processar duas vezes o mesmo documento.',
      'Após três tentativas sem sucesso, a mensagem vai para a fila de erros.',
    ],
    problemas: [
      'A mesma nota é gerada duas vezes quando a confirmação demora a chegar.',
      'Mensagens com erro ficam em laço infinito e bloqueiam as seguintes.',
      'O cabeçalho da mensagem vem truncado e o roteamento falha.',
    ],
    solucoes: [
      'Registrar a chave do documento antes de processar e descartar repetições.',
      'Limitar as tentativas e mover para a fila de erros com o motivo anexado.',
    ],
  },
  {
    tag: 'campos-opcionais',
    titulos: [
      'Campos obrigatórios ausentes e valores padrão',
      'Omissão de elementos vazios no XML de destino',
      'Preenchimento condicional por tipo de operação',
    ],
    regras: [
      'Elementos opcionais vazios não são gerados; o destino trata tag vazia como erro.',
      'Quando um campo obrigatório falta na origem, aplica-se o valor padrão acordado com o cliente.',
      'Alguns grupos só existem quando o tipo de operação for exportação.',
    ],
    problemas: [
      'O destino rejeita o documento por causa de tags vazias.',
      'Campos obrigatórios chegam nulos e o valor padrão não é aplicado.',
      'Grupos de exportação aparecem em operações internas.',
    ],
    solucoes: [
      'Podar elementos vazios depois da transformação e validar contra o esquema antes do envio.',
      'Condicionar a criação do grupo ao tipo da operação.',
    ],
  },
  {
    tag: 'assinatura',
    titulos: [
      'Assinatura digital e ordem dos elementos do XML',
      'Posicionamento do bloco de assinatura no documento',
      'Canonicalização antes de assinar o conteúdo',
    ],
    regras: [
      'A assinatura é aplicada depois que o documento está completo e não pode ser alterada depois.',
      'A ordem dos elementos segue o esquema; fora de ordem, a validação falha.',
      'Espaços e quebras de linha entre tags são removidos antes da canonicalização.',
    ],
    problemas: [
      'A assinatura é considerada inválida porque o XML foi reformatado após assinar.',
      'Um elemento fora de ordem faz o esquema rejeitar o documento.',
      'Espaços em branco extras alteram o resumo criptográfico.',
    ],
    solucoes: [
      'Assinar como última etapa do fluxo e nunca reserializar o documento depois.',
      'Gerar os elementos na ordem do esquema e minificar o XML antes de assinar.',
    ],
  },
  {
    tag: 'performance',
    titulos: [
      'Lote grande causa lentidão na transformação',
      'Consumo de memória ao processar arquivos extensos',
      'Processamento em partes de documentos volumosos',
    ],
    regras: [
      'Arquivos acima de cinquenta megabytes são lidos em fluxo, sem carregar tudo na memória.',
      'O lote é dividido em blocos de quinhentos documentos processados em paralelo limitado.',
      'Consultas de de-para são mantidas em cache durante todo o lote.',
    ],
    problemas: [
      'O serviço trava por falta de memória ao receber arquivos muito grandes.',
      'Cada documento consulta a tabela de equivalência no banco e o lote demora horas.',
      'O tempo de resposta degrada conforme o lote cresce.',
    ],
    solucoes: [
      'Ler em fluxo, processar por blocos e carregar as tabelas de apoio uma única vez.',
      'Adicionar cache em memória para consultas repetidas.',
    ],
  },
];

export const TIPOS_DOCUMENTO = [
  ['NFE', 'Nota Fiscal Eletrônica'],
  ['CTE', 'Conhecimento de Transporte Eletrônico'],
  ['MQS', 'Mensagem de fila MQSeries (formato CNH fictício)'],
  ['IDOC', 'Documento intermediário IDOC genérico'],
  ['MDFE', 'Manifesto de Documentos Fiscais Eletrônicos'],
  ['NFSE', 'Nota Fiscal de Serviços Eletrônica'],
];

export const CATEGORIAS = [
  'Datas e horários', 'Valores e moedas', 'Identificadores', 'Codificação e texto', 'Tributação',
  'Estrutura do documento', 'Transporte e logística', 'Mensageria', 'Validação de esquema', 'Desempenho',
];

export const STATUS = ['rascunho', 'em_revisao', 'publicado', 'publicado', 'publicado', 'obsoleto'];
