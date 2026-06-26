import type { X402Payload } from './agent_pay_protocol';

export interface GuardSettings {
  enabled: boolean;
  dailySpendLimitUcents: number; // ex: 50.000.000 ucents = $50.00
  allowlist: string[]; // ex: ['aws_compute', 'partssource_corp', 'google_cloud_m2m']
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
 * Valida uma proposta de transação x402 contra as regras de segurança do Guard Mode.
 * 
 * @param payload O payload da transação a ser avaliado
 * @param currentDailySpendUcents Gastos acumulados na janela atual de 24h
 * @param settings Configurações vigentes do Guard Mode
 */
export function evaluateTransaction(
  payload: X402Payload,
  currentDailySpendUcents: number,
  settings: GuardSettings
): GuardCheckResult {
  // Se o Guard Mode estiver desligado, aprova imediatamente
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
      reason: `Bloqueado pelo Guard Mode: O fornecedor "${payload.merchantId}" não está na lista de permissões (allowlist).`,
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
      reason: `Bloqueado pelo Guard Mode: Limite de gastos diários excedido. Limite: $${limitUSD}, Atual: $${currentUSD}, Transação: $${txUSD} (Projetado: $${projectedUSD})`,
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
 * Configurações padrão iniciais do Guard Mode.
 */
export const DEFAULT_GUARD_SETTINGS: GuardSettings = {
  enabled: true,
  dailySpendLimitUcents: 50000000, // $50.00 USD
  allowlist: ['aws_compute', 'partssource_corp', 'google_cloud_m2m', 'mcmaster_carr'],
};
