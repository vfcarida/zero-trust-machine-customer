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

/** Navigation menu items for the sidebar. */
export const NAV_ITEMS = [
  { label: 'Autonomous Agent', href: ROUTES.DASHBOARD, icon: 'Cpu' },
  { label: 'Guard Policies', href: ROUTES.SECURITY, icon: 'ShieldCheck' },
  { label: 'Zero-Trust Mesh', href: ROUTES.NETWORK, icon: 'Network' },
  { label: 'Ledger History', href: ROUTES.LEDGER, icon: 'Receipt' },
] as const;

/** Approved Merchant configuration for simulation display. */
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
    category: 'CPU Processing',
    icon: 'Server',
    description: 'Elastic on-demand cloud compute instances.',
  },
  {
    id: 'mcmaster_carr',
    name: 'McMaster-Carr Supply Co.',
    category: 'Coolant Fluid',
    icon: 'Wrench',
    description: 'Industrial supply and specialized coolant fluids.',
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
    category: 'Hardware & Sensors',
    icon: 'Cpu',
    description: 'Industrial replacement parts, sensors, and automation circuits.',
  },
];
