import type { X402Payload } from './agent_pay_protocol';

export interface GuardSettings {
  enabled: boolean;
  dailySpendLimitUcents: number; // e.g., 50,000,000 ucents = $50.00 USD
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
 * Validates a proposed x402 transaction payload against Guard Mode rules.
 * Refactored to enforce strict bounds validation and support case-insensitive merchant matching.
 * 
 * @param payload The transaction payload to evaluate
 * @param currentDailySpendUcents Accumulated spends in the current 24h window
 * @param settings Active Guard Mode settings
 */
export function evaluateTransaction(
  payload: X402Payload,
  currentDailySpendUcents: number,
  settings: GuardSettings
): GuardCheckResult {
  // Defensive checks for invalid input bounds
  const validatedSpend = Math.max(0, currentDailySpendUcents);

  // If Guard Mode is disabled, approve the transaction immediately
  if (!settings.enabled) {
    return {
      approved: true,
      details: {
        currentDailySpendUcents: validatedSpend,
        limitUcents: settings.dailySpendLimitUcents,
        merchantApproved: true,
        violatesLimit: false,
        violatesMerchant: false,
      },
    };
  }

  // Ensure case-insensitive and whitespace-insensitive merchant verification
  const normalizedMerchant = (payload.merchantId || '').toLowerCase().trim();
  const merchantApproved = settings.allowlist.some(
    (allowed) => (allowed || '').toLowerCase().trim() === normalizedMerchant
  );
  
  const projectedSpend = validatedSpend + payload.amountUcents;
  const violatesLimit = projectedSpend > settings.dailySpendLimitUcents;
  const violatesMerchant = !merchantApproved;

  if (violatesMerchant) {
    return {
      approved: false,
      reason: `Blocked by Guard Mode: The merchant "${payload.merchantId}" is not in the allowlist.`,
      details: {
        currentDailySpendUcents: validatedSpend,
        limitUcents: settings.dailySpendLimitUcents,
        merchantApproved: false,
        violatesLimit,
        violatesMerchant: true,
      },
    };
  }

  if (violatesLimit) {
    const limitUSD = (settings.dailySpendLimitUcents / 1000000).toFixed(2);
    const currentUSD = (validatedSpend / 1000000).toFixed(2);
    const txUSD = (payload.amountUcents / 1000000).toFixed(2);
    const projectedUSD = (projectedSpend / 1000000).toFixed(2);

    return {
      approved: false,
      reason: `Blocked by Guard Mode: Daily spending limit exceeded. Limit: $${limitUSD}, Current: $${currentUSD}, Transaction: $${txUSD} (Projected: $${projectedUSD})`,
      details: {
        currentDailySpendUcents: validatedSpend,
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
      currentDailySpendUcents: validatedSpend,
      limitUcents: settings.dailySpendLimitUcents,
      merchantApproved: true,
      violatesLimit: false,
      violatesMerchant: false,
    },
  };
}

/**
 * Default configurations for Guard Mode.
 */
export const DEFAULT_GUARD_SETTINGS: GuardSettings = {
  enabled: true,
  dailySpendLimitUcents: 50000000, // $50.00 USD
  allowlist: ['aws_compute', 'partssource_corp', 'google_cloud_m2m', 'mcmaster_carr'],
};
