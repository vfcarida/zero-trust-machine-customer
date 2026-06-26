import type { X402Payload } from './agent_pay_protocol';

export interface GuardSettings {
  enabled: boolean;
  dailySpendLimitUcents: number; // e.g., 50,000,000 ucents = $50.00
  allowlist: string[]; // e.g., ['aws_compute', 'partssource_corp', 'google_cloud_m2m']
}

export interface GuardCheckResult {
  approved: boolean;
  reason?: string;
  details?: {
    currentDailySpendUcents: number;
    limitUcents: number;
    merchantApproved: boolean;
    violatesLimit: boolean;
    violatesMerchant: boolean;
  };
}

/**
 * Checks a proposed x402 transaction payload against Guard Mode safety policies.
 * 
 * @param payload The transaction payload to evaluate
 * @param currentDailySpendUcents Accumulated spend in the current 24h window
 * @param settings Current Guard Mode configuration
 */
export function evaluateTransaction(
  payload: X402Payload,
  currentDailySpendUcents: number,
  settings: GuardSettings
): GuardCheckResult {
  // If Guard Mode is disabled, approve immediately
  if (!settings.enabled) {
    return {
      approved: true,
      details: {
        currentDailySpendUcents,
        limitUcents: settings.dailySpendLimitUcents,
        merchantApproved: true,
        violatesLimit: false,
        violatesMerchant: false,
      },
    };
  }

  const merchantApproved = settings.allowlist.some(
    (allowed) => allowed.toLowerCase().trim() === payload.merchantId.toLowerCase().trim()
  );
  
  const projectedSpend = currentDailySpendUcents + payload.amountUcents;
  const violatesLimit = projectedSpend > settings.dailySpendLimitUcents;
  const violatesMerchant = !merchantApproved;

  if (violatesMerchant) {
    return {
      approved: false,
      reason: `Blocked by Guard Mode: Merchant "${payload.merchantId}" is not in the allowlist.`,
      details: {
        currentDailySpendUcents,
        limitUcents: settings.dailySpendLimitUcents,
        merchantApproved: false,
        violatesLimit,
        violatesMerchant: true,
      },
    };
  }

  if (violatesLimit) {
    const limitUSD = (settings.dailySpendLimitUcents / 1000000).toFixed(2);
    const currentUSD = (currentDailySpendUcents / 1000000).toFixed(2);
    const txUSD = (payload.amountUcents / 1000000).toFixed(2);
    const projectedUSD = (projectedSpend / 1000000).toFixed(2);

    return {
      approved: false,
      reason: `Blocked by Guard Mode: Daily spending limit exceeded. Limit: $${limitUSD}, Current: $${currentUSD}, Tx: $${txUSD} (Projected: $${projectedUSD})`,
      details: {
        currentDailySpendUcents,
        limitUcents: settings.dailySpendLimitUcents,
        merchantApproved: true,
        violatesLimit: true,
        violatesMerchant: false,
      },
    };
  }

  return {
    approved: true,
    details: {
      currentDailySpendUcents,
      limitUcents: settings.dailySpendLimitUcents,
      merchantApproved: true,
      violatesLimit: false,
      violatesMerchant: false,
    },
  };
}

/**
 * Default Guard Mode settings for new setups.
 */
export const DEFAULT_GUARD_SETTINGS: GuardSettings = {
  enabled: true,
  dailySpendLimitUcents: 50000000, // $50.00 USD
  allowlist: ['aws_compute', 'partssource_corp', 'google_cloud_m2m', 'mcmaster_carr'],
};
