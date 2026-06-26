// ============================================================================
// Zero-Trust Machine Customer — Application Constants
// ============================================================================

/** Navigation route definitions. */
export const ROUTES = {
  DASHBOARD: '/',
  SECURITY: '/security',
  NETWORK: '/network',
  LEDGER: '/ledger',
} as const;

/** Navigation items for the sidebar. */
export const NAV_ITEMS = [
  { label: 'Autonomous Agent', href: ROUTES.DASHBOARD, icon: 'Cpu' },
  { label: 'Guard Policy', href: ROUTES.SECURITY, icon: 'ShieldCheck' },
  { label: 'Zero-Trust Overlay', href: ROUTES.NETWORK, icon: 'Network' },
  { label: 'Transaction Ledger', href: ROUTES.LEDGER, icon: 'Receipt' },
] as const;

/** Approved Merchants definitions for simulation display. */
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
    category: 'Cloud Compute',
    icon: 'Server',
    description: 'On-demand elastic cloud node execution cores.',
  },
  {
    id: 'mcmaster_carr',
    name: 'McMaster-Carr Supply Co.',
    category: 'Industrial Supplies',
    icon: 'Wrench',
    description: 'Sourcing components, fluid parts, and liquid cooling reagents.',
  },
  {
    id: 'google_cloud_m2m',
    name: 'Google Cloud Platform (M2M Portal)',
    category: 'AI / Storage',
    icon: 'Cloud',
    description: 'Autonomous storage expansion and high-speed memory buffers.',
  },
  {
    id: 'partssource_corp',
    name: 'PartsSource Industrial',
    category: 'Hardware Systems',
    icon: 'Cpu',
    description: 'Spare circuit nodes, sensory chips, and automation parts.',
  },
];
