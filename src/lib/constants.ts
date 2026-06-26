// ============================================================================
// Zero-Trust Machine Customer — Constantes da Aplicação
// ============================================================================

/** Definições de rotas de navegação. */
export const ROUTES = {
  DASHBOARD: '/',
  SECURITY: '/security',
  NETWORK: '/network',
  LEDGER: '/ledger',
} as const;

/** Itens de navegação para o menu lateral. */
export const NAV_ITEMS = [
  { label: 'Agente Autônomo', href: ROUTES.DASHBOARD, icon: 'Cpu' },
  { label: 'Políticas Guard', href: ROUTES.SECURITY, icon: 'ShieldCheck' },
  { label: 'Malha Zero-Trust', href: ROUTES.NETWORK, icon: 'Network' },
  { label: 'Histórico Ledger', href: ROUTES.LEDGER, icon: 'Receipt' },
] as const;

/** Definições de Fornecedores Aprovados para exibição de simulação. */
export interface MerchantConfig {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
}

export const APPROVED_MERCHANTS: MerchantConfig[] = [
  {
    id: 'aws_compute',
    name: 'Amazon Web Services M2M',
    category: 'Processamento de CPU',
    icon: 'Server',
    description: 'Instâncias elásticas de processamento em nuvem sob demanda.',
  },
  {
    id: 'mcmaster_carr',
    name: 'McMaster-Carr Supply Co.',
    category: 'Fluido Coolant',
    icon: 'Wrench',
    description: 'Fornecimento de insumos industriais e fluidos refrigerantes.',
  },
  {
    id: 'google_cloud_m2m',
    name: 'Google Cloud Platform (M2M Portal)',
    category: 'AI / Armazenamento',
    icon: 'Cloud',
    description: 'Expansão autônoma de armazenamento e buffer de memória.',
  },
  {
    id: 'partssource_corp',
    name: 'PartsSource Industrial',
    category: 'Hardware e Sensores',
    icon: 'Cpu',
    description: 'Sourcing de peças, sensores e circuitos de automação.',
  },
];
