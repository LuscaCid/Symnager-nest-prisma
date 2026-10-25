import type { OrderStatus } from '../common/enums';

/**
 * Ramos de atuação. Cada perfil muda rótulos, campos visíveis, listas iniciais,
 * mensagens e recursos da OS; as colunas do banco são as mesmas para todos.
 * O app recebe o perfil ativo em GET /settings (segment_profile).
 */
export const SEGMENT_IDS = [
  'CELULAR_INFORMATICA',
  'AR_CONDICIONADO',
  'ELETRODOMESTICOS',
  'SERVICOS_GERAIS',
] as const;
export type SegmentId = (typeof SEGMENT_IDS)[number];
export const DEFAULT_SEGMENT: SegmentId = 'CELULAR_INFORMATICA';

export const CERTIFICATE_TYPES = [
  'HIGIENIZACAO',
  'MANUTENCAO_PREVENTIVA',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export type FieldMode = 'required' | 'optional' | 'hidden';
export type OrderFieldKey =
  | 'device_type'
  | 'brand'
  | 'model'
  | 'serial'
  | 'accessories'
  | 'condition'
  | 'device_password'
  | 'checklist'
  | 'service_address'
  | 'scheduled_at';

export type CustomFieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

/** Campo adicional da OS (do ramo ou criado pela empresa). Valor em orders.custom_fields[key]. */
export type CustomFieldDef = {
  key: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  unit?: string;
  show_on_reception?: boolean;
  show_on_print?: boolean;
  active?: boolean;
};

export type SegmentLabels = {
  /** Substantivo usado em textos: "aparelho", "equipamento", "serviço". */
  equipment: string;
  equipment_plural: string;
  /** Rótulos dos campos da OS. */
  device: string;
  device_placeholder: string;
  device_type: string;
  brand: string;
  model: string;
  model_placeholder: string;
  serial: string;
  accessories: string;
  condition: string;
  condition_placeholder: string;
  device_password: string;
  description: string;
  description_placeholder: string;
  diagnosis: string;
  solution: string;
  checklist: string;
  service_address: string;
  scheduled_at: string;
  /** Nome do negócio em textos ("assistência técnica"). */
  business: string;
  /** Painel do dashboard ("Top aparelhos"). */
  top_types: string;
  /** "Tempo médio de reparo". */
  turnaround: string;
};

export type CertificateTemplate = {
  title: string;
  checklist: string[];
  products_hint?: string;
  measurements?: boolean;
  months_setting: 'hygiene_months' | 'preventive_months';
  disclaimer?: boolean;
};

export type SegmentProfile = {
  id: SegmentId;
  name: string;
  short_name: string;
  description: string;
  labels: SegmentLabels;
  fields: Record<OrderFieldKey, FieldMode>;
  status_labels: Partial<Record<OrderStatus, string>>;
  lookup_labels: Record<string, string>;
  messages: {
    /** Sujeito da mensagem de WhatsApp; {equipamento} = campo device. */
    subject: string;
    status: Partial<Record<OrderStatus, string>>;
    scheduled: string;
  };
  equipment_fields: CustomFieldDef[];
  features: { on_site: boolean; certificates: CertificateType[] };
  certificate_templates: Partial<Record<CertificateType, CertificateTemplate>>;
  defaults: { warranty_days: number };
  seeds: Record<string, string[]>;
};

const COMMON_STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  ABERTA: 'foi recebido e está na fila de atendimento',
  EM_ANALISE: 'está em análise pela nossa equipe técnica',
  AGUARDANDO_APROVACAO: 'já foi avaliado e o orçamento aguarda sua aprovação',
  APROVADA: 'teve o orçamento aprovado e logo entra em reparo',
  AGUARDANDO_PECA: 'está aguardando a chegada de uma peça',
  EM_REPARO: 'está em reparo',
  PRONTA: 'está pronto para retirada',
  ENTREGUE: 'foi entregue. Obrigado pela confiança!',
  CANCELADA: 'teve a ordem de serviço cancelada',
};

const ON_SITE_STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  ABERTA: 'foi registrado e está na nossa agenda',
  EM_ANALISE: 'está em avaliação pela nossa equipe técnica',
  AGUARDANDO_APROVACAO: 'já foi avaliado e o orçamento aguarda sua aprovação',
  APROVADA: 'teve o orçamento aprovado e será agendado',
  AGUARDANDO_PECA: 'está aguardando a chegada de material',
  EM_REPARO: 'está em execução',
  PRONTA: 'foi concluído',
  ENTREGUE: 'foi finalizado. Obrigado pela confiança!',
  CANCELADA: 'teve a ordem de serviço cancelada',
};

const BASE_LOOKUP_LABELS = {
  DEVICE_TYPE: 'Tipos de equipamento',
  BRAND: 'Marcas',
  PAYMENT_METHOD: 'Formas de pagamento',
  FAILURE_REASON: 'Motivos de falha',
  ACCESSORY: 'Acessórios',
  CHECKLIST: 'Checklist de entrada',
};

const PAYMENT_METHODS = [
  'Dinheiro',
  'PIX',
  'Cartão de crédito',
  'Cartão de débito',
  'Transferência',
  'Boleto',
];

const BTU_OPTIONS = [
  '7.000',
  '9.000',
  '12.000',
  '18.000',
  '24.000',
  '30.000',
  '36.000',
  '48.000',
  '57.000',
  '60.000',
];

export const PMOC_DISCLAIMER =
  'Este relatório registra a manutenção preventiva executada e não substitui o Plano de Manutenção, Operação e Controle (PMOC) exigido pela Lei 13.589/2018, que deve ser elaborado e assinado por profissional habilitado.';

export const SEGMENTS: Record<SegmentId, SegmentProfile> = {
  CELULAR_INFORMATICA: {
    id: 'CELULAR_INFORMATICA',
    name: 'Celulares e informática',
    short_name: 'Celulares',
    description:
      'Assistência técnica de celulares, notebooks, computadores, tablets e consoles.',
    labels: {
      equipment: 'aparelho',
      equipment_plural: 'aparelhos',
      device: 'Equipamento',
      device_placeholder: 'ex.: Samsung Galaxy S20',
      device_type: 'Tipo de equipamento',
      brand: 'Marca',
      model: 'Modelo',
      model_placeholder: 'ex.: SM-G980F',
      serial: 'Nº de série / IMEI',
      accessories: 'Acessórios entregues',
      condition: 'Estado físico na entrada',
      condition_placeholder: 'riscos, trincas, amassados...',
      device_password: 'Senha / padrão de desbloqueio',
      description: 'Defeito relatado',
      description_placeholder: 'Defeito relatado pelo cliente',
      diagnosis: 'Diagnóstico técnico',
      solution: 'Solução aplicada',
      checklist: 'Checklist de entrada',
      service_address: 'Local do atendimento',
      scheduled_at: 'Visita agendada',
      business: 'assistência técnica',
      top_types: 'Top equipamentos',
      turnaround: 'Tempo médio de reparo',
    },
    fields: {
      device_type: 'optional',
      brand: 'optional',
      model: 'optional',
      serial: 'optional',
      accessories: 'optional',
      condition: 'optional',
      device_password: 'optional',
      checklist: 'optional',
      service_address: 'hidden',
      scheduled_at: 'hidden',
    },
    status_labels: {},
    lookup_labels: BASE_LOOKUP_LABELS,
    messages: {
      subject: 'Seu {equipamento}',
      status: COMMON_STATUS_MESSAGES,
      scheduled: 'tem visita agendada para {data}',
    },
    equipment_fields: [],
    features: { on_site: false, certificates: [] },
    certificate_templates: {},
    defaults: { warranty_days: 90 },
    seeds: {
      DEVICE_TYPE: [
        'Smartphone',
        'Notebook',
        'Desktop',
        'Tablet',
        'Console',
        'Smartwatch',
        'Monitor',
        'Impressora',
        'Outro',
      ],
      BRAND: [
        'Apple',
        'Samsung',
        'Motorola',
        'Xiaomi',
        'LG',
        'Asus',
        'Lenovo',
        'Dell',
        'HP',
        'Acer',
        'Sony',
        'Microsoft',
        'Nintendo',
        'Positivo',
        'Multilaser',
      ],
      PAYMENT_METHOD: PAYMENT_METHODS,
      FAILURE_REASON: [
        'Cliente ausente',
        'Endereço incorreto',
        'Defeito voltou',
        'Peça com defeito',
        'Atraso na peça',
        'Serviço mal executado',
        'Dano no equipamento',
        'Prazo não cumprido',
      ],
      ACCESSORY: [
        'Carregador',
        'Cabo USB',
        'Capa',
        'Película',
        'Bateria',
        'Chip',
        'Cartão de memória',
        'Caixa',
        'Controle',
      ],
      CHECKLIST: [
        'Liga',
        'Tela íntegra',
        'Touch funcionando',
        'Câmeras',
        'Áudio',
        'Microfone',
        'Wi-Fi',
        'Bluetooth',
        'Carregamento',
        'Botões',
      ],
    },
  },

  AR_CONDICIONADO: {
    id: 'AR_CONDICIONADO',
    name: 'Ar-condicionado e refrigeração',
    short_name: 'Climatização',
    description:
      'Instalação, limpeza e manutenção de ar-condicionado e refrigeração, com certificados de higienização e manutenção.',
    labels: {
      equipment: 'equipamento',
      equipment_plural: 'equipamentos',
      device: 'Equipamento',
      device_placeholder: 'ex.: Split hi-wall 12.000 BTUs da sala',
      device_type: 'Tipo de equipamento',
      brand: 'Marca',
      model: 'Modelo',
      model_placeholder: 'ex.: 38TVCA12M5',
      serial: 'Nº de série',
      accessories: 'Itens no local',
      condition: 'Condições encontradas',
      condition_placeholder: 'sujeira, vazamento, ruído, gelo na serpentina...',
      device_password: 'Senha',
      description: 'Serviço solicitado / problema relatado',
      description_placeholder:
        'ex.: limpeza completa, não está gelando, pingando água',
      diagnosis: 'Diagnóstico técnico',
      solution: 'Serviço executado',
      checklist: 'Checklist do serviço',
      service_address: 'Local do atendimento',
      scheduled_at: 'Visita agendada',
      business: 'empresa de climatização',
      top_types: 'Top tipos de equipamento',
      turnaround: 'Tempo médio de atendimento',
    },
    fields: {
      device_type: 'optional',
      brand: 'optional',
      model: 'optional',
      serial: 'optional',
      accessories: 'hidden',
      condition: 'optional',
      device_password: 'hidden',
      checklist: 'optional',
      service_address: 'optional',
      scheduled_at: 'optional',
    },
    status_labels: {
      AGUARDANDO_PECA: 'Aguardando material',
      EM_REPARO: 'Em execução',
      PRONTA: 'Concluída',
    },
    lookup_labels: {
      ...BASE_LOOKUP_LABELS,
      ACCESSORY: 'Itens no local',
      CHECKLIST: 'Checklist do serviço',
    },
    messages: {
      subject: 'O atendimento do seu {equipamento}',
      status: ON_SITE_STATUS_MESSAGES,
      scheduled: 'está agendado para {data}',
    },
    equipment_fields: [
      {
        key: 'btu',
        label: 'Capacidade (BTUs)',
        type: 'select',
        options: BTU_OPTIONS,
        show_on_reception: true,
        show_on_print: true,
      },
      {
        key: 'gas',
        label: 'Gás refrigerante',
        type: 'select',
        options: ['R-410A', 'R-32', 'R-22', 'R-134a', 'R-404A'],
        show_on_reception: true,
        show_on_print: true,
      },
      {
        key: 'tensao',
        label: 'Tensão',
        type: 'select',
        options: ['127 V', '220 V', '380 V'],
        show_on_reception: false,
        show_on_print: true,
      },
      {
        key: 'ambiente',
        label: 'Ambiente',
        type: 'text',
        show_on_reception: true,
        show_on_print: true,
      },
    ],
    features: {
      on_site: true,
      certificates: ['HIGIENIZACAO', 'MANUTENCAO_PREVENTIVA'],
    },
    certificate_templates: {
      HIGIENIZACAO: {
        title: 'Certificado de Higienização',
        months_setting: 'hygiene_months',
        products_hint: 'Bactericida, desincrustante, detergente neutro...',
        checklist: [
          'Limpeza dos filtros de ar',
          'Higienização da serpentina da evaporadora',
          'Limpeza da bandeja de condensado',
          'Desobstrução e teste do dreno',
          'Limpeza da turbina (ventilador)',
          'Aplicação de bactericida',
          'Limpeza da carenagem e aletas',
          'Limpeza da condensadora',
          'Teste de funcionamento',
        ],
      },
      MANUTENCAO_PREVENTIVA: {
        title: 'Relatório de Manutenção Preventiva',
        months_setting: 'preventive_months',
        measurements: true,
        disclaimer: true,
        checklist: [
          'Filtros de ar limpos ou substituídos',
          'Serpentina da evaporadora',
          'Bandeja e dreno',
          'Turbina e motor do ventilador',
          'Condensadora e aletas',
          'Pressão de gás verificada',
          'Corrente elétrica medida',
          'Conexões elétricas reapertadas',
          'Isolamento térmico da tubulação',
          'Controle remoto e sensores',
          'Temperatura de insuflamento e retorno',
        ],
      },
    },
    defaults: { warranty_days: 90 },
    seeds: {
      DEVICE_TYPE: [
        'Split hi-wall',
        'Piso-teto',
        'Cassete',
        'Janela',
        'Portátil',
        'Multi-split',
        'VRF',
        'Câmara fria',
        'Geladeira comercial',
        'Outro',
      ],
      BRAND: [
        'Daikin',
        'LG',
        'Samsung',
        'Midea',
        'Gree',
        'Elgin',
        'Carrier',
        'Springer',
        'Fujitsu',
        'Consul',
        'Electrolux',
        'Philco',
        'Agratto',
        'TCL',
      ],
      PAYMENT_METHOD: PAYMENT_METHODS,
      FAILURE_REASON: [
        'Cliente ausente na visita',
        'Acesso ao local impedido',
        'Endereço incorreto',
        'Defeito voltou',
        'Vazamento de gás',
        'Peça com defeito',
        'Atraso na peça',
        'Serviço mal executado',
        'Prazo não cumprido',
      ],
      ACCESSORY: ['Controle remoto', 'Suporte', 'Kit de instalação'],
      CHECKLIST: [
        'Filtros de ar',
        'Serpentina da evaporadora',
        'Bandeja de condensado',
        'Dreno',
        'Turbina',
        'Aplicação de bactericida',
        'Condensadora',
        'Pressão de gás',
        'Corrente elétrica',
        'Temperatura de insuflamento',
        'Conexões elétricas',
      ],
    },
  },

  ELETRODOMESTICOS: {
    id: 'ELETRODOMESTICOS',
    name: 'Eletrodomésticos',
    short_name: 'Eletrodomésticos',
    description:
      'Conserto de linha branca e eletroportáteis, na oficina ou na casa do cliente.',
    labels: {
      equipment: 'eletrodoméstico',
      equipment_plural: 'eletrodomésticos',
      device: 'Equipamento',
      device_placeholder: 'ex.: Geladeira Brastemp Frost Free',
      device_type: 'Tipo de equipamento',
      brand: 'Marca',
      model: 'Modelo',
      model_placeholder: 'ex.: BRM44HK',
      serial: 'Nº de série',
      accessories: 'Acessórios entregues',
      condition: 'Estado na entrada',
      condition_placeholder: 'amassados, ferrugem, peças faltando...',
      device_password: 'Senha',
      description: 'Defeito relatado',
      description_placeholder: 'ex.: não gela, não centrifuga, faz barulho',
      diagnosis: 'Diagnóstico técnico',
      solution: 'Solução aplicada',
      checklist: 'Checklist de entrada',
      service_address: 'Local do atendimento',
      scheduled_at: 'Visita agendada',
      business: 'assistência técnica',
      top_types: 'Top equipamentos',
      turnaround: 'Tempo médio de reparo',
    },
    fields: {
      device_type: 'optional',
      brand: 'optional',
      model: 'optional',
      serial: 'optional',
      accessories: 'optional',
      condition: 'optional',
      device_password: 'hidden',
      checklist: 'optional',
      service_address: 'optional',
      scheduled_at: 'optional',
    },
    status_labels: {},
    lookup_labels: BASE_LOOKUP_LABELS,
    messages: {
      subject: 'Seu {equipamento}',
      status: COMMON_STATUS_MESSAGES,
      scheduled: 'tem visita agendada para {data}',
    },
    equipment_fields: [
      {
        key: 'tensao',
        label: 'Tensão',
        type: 'select',
        options: ['127 V', '220 V', 'Bivolt'],
        show_on_reception: true,
        show_on_print: true,
      },
    ],
    features: { on_site: false, certificates: [] },
    certificate_templates: {},
    defaults: { warranty_days: 90 },
    seeds: {
      DEVICE_TYPE: [
        'Geladeira',
        'Freezer',
        'Máquina de lavar',
        'Lava e seca',
        'Secadora',
        'Micro-ondas',
        'Fogão',
        'Cooktop',
        'Forno elétrico',
        'Lava-louças',
        'Purificador de água',
        'Eletroportátil',
        'Outro',
      ],
      BRAND: [
        'Brastemp',
        'Consul',
        'Electrolux',
        'LG',
        'Samsung',
        'Philco',
        'Mondial',
        'Arno',
        'Midea',
        'Panasonic',
        'Britânia',
        'Esmaltec',
        'Continental',
      ],
      PAYMENT_METHOD: PAYMENT_METHODS,
      FAILURE_REASON: [
        'Cliente ausente',
        'Endereço incorreto',
        'Defeito voltou',
        'Peça com defeito',
        'Atraso na peça',
        'Serviço mal executado',
        'Dano no equipamento',
        'Prazo não cumprido',
      ],
      ACCESSORY: [
        'Cabo de energia',
        'Mangueiras',
        'Prateleiras',
        'Gavetas',
        'Prato giratório',
        'Manual',
      ],
      CHECKLIST: [
        'Liga',
        'Aquece / gela',
        'Painel e botões',
        'Vedação e borrachas',
        'Ruído anormal',
        'Vazamento',
        'Cabo e plugue',
        'Portas e dobradiças',
      ],
    },
  },

  SERVICOS_GERAIS: {
    id: 'SERVICOS_GERAIS',
    name: 'Serviços gerais',
    short_name: 'Serviços',
    description:
      'Para autônomos e prestadores de serviço de qualquer área: manutenção, reformas, instalação e visitas técnicas.',
    labels: {
      equipment: 'serviço',
      equipment_plural: 'serviços',
      device: 'Serviço / item',
      device_placeholder: 'ex.: Troca de chuveiro, instalação de prateleiras',
      device_type: 'Categoria',
      brand: 'Marca',
      model: 'Modelo',
      model_placeholder: '',
      serial: 'Nº de série',
      accessories: 'Materiais do cliente',
      condition: 'Situação encontrada',
      condition_placeholder: 'o que foi encontrado no local',
      device_password: 'Senha',
      description: 'Serviço solicitado',
      description_placeholder: 'Descreva o que o cliente pediu',
      diagnosis: 'Avaliação técnica',
      solution: 'Serviço executado',
      checklist: 'Checklist do serviço',
      service_address: 'Local do atendimento',
      scheduled_at: 'Visita agendada',
      business: 'empresa',
      top_types: 'Top categorias',
      turnaround: 'Tempo médio de atendimento',
    },
    fields: {
      device_type: 'optional',
      brand: 'hidden',
      model: 'hidden',
      serial: 'hidden',
      accessories: 'hidden',
      condition: 'optional',
      device_password: 'hidden',
      checklist: 'optional',
      service_address: 'optional',
      scheduled_at: 'optional',
    },
    status_labels: {
      AGUARDANDO_PECA: 'Aguardando material',
      EM_REPARO: 'Em execução',
      PRONTA: 'Concluída',
    },
    lookup_labels: {
      ...BASE_LOOKUP_LABELS,
      DEVICE_TYPE: 'Categorias de serviço',
      ACCESSORY: 'Materiais do cliente',
      CHECKLIST: 'Checklist do serviço',
    },
    messages: {
      subject: 'O serviço "{equipamento}"',
      status: ON_SITE_STATUS_MESSAGES,
      scheduled: 'está agendado para {data}',
    },
    equipment_fields: [],
    features: { on_site: true, certificates: [] },
    certificate_templates: {},
    defaults: { warranty_days: 90 },
    seeds: {
      DEVICE_TYPE: [
        'Instalação',
        'Manutenção',
        'Reparo',
        'Reforma',
        'Montagem',
        'Limpeza',
        'Visita técnica',
        'Orçamento',
        'Outro',
      ],
      BRAND: [],
      PAYMENT_METHOD: PAYMENT_METHODS,
      FAILURE_REASON: [
        'Cliente ausente na visita',
        'Acesso ao local impedido',
        'Endereço incorreto',
        'Serviço refeito',
        'Material com defeito',
        'Atraso no material',
        'Prazo não cumprido',
      ],
      ACCESSORY: [],
      CHECKLIST: [
        'Local protegido antes do serviço',
        'Material conferido',
        'Teste de funcionamento',
        'Local limpo ao final',
        'Cliente conferiu o serviço',
      ],
    },
  },
};

export const isSegmentId = (value: unknown): value is SegmentId =>
  typeof value === 'string' &&
  (SEGMENT_IDS as readonly string[]).includes(value);

export const segmentProfile = (id: unknown): SegmentProfile =>
  SEGMENTS[isSegmentId(id) ? id : DEFAULT_SEGMENT];
