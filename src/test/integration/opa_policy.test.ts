import { describe, it, expect } from 'vitest';
import { OPAClient } from '../../infrastructure/authorization/opa_client';
import { GuardSettings, X402Payload } from '../../domain/types';

describe('Integration: OPA Policy Resolution & Decision Engine', () => {
  const opaClient = new OPAClient();
  const guardSettings: GuardSettings = {
    enabled: true,
    dailySpendLimitUcents: 50000000,
    allowlist: ['aws_compute', 'partssource_corp'],
    maxRatePerMinute: 60,
  };

  const validPayload: X402Payload = {
    x402Version: '1.0.0',
    agentId: 'agent_001',
    merchantId: 'aws_compute',
    intent: 'Procure Compute',
    amountUcents: 5000000,
    currency: 'USD',
    timestamp: new Date().toISOString(),
    nonce: 'nonce_87654321',
    signature: 'sim_sig_valid',
  };

  it('should grant approval for valid payload within limits', async () => {
    const decision = await opaClient.evaluateAuthorization({
      action: 'execute_transaction',
      transaction: validPayload,
      currentDailySpendUcents: 10000000,
      guardSettings,
      taintStatus: 'UNTAINTED',
    });

    expect(decision.allow).toBe(true);
    expect(decision.reasons).toHaveLength(0);
  });

  it('should deny authorization when merchant is not in allowlist', async () => {
    const unauthorizedPayload = { ...validPayload, merchantId: 'untrusted_vendor_x' };
    const decision = await opaClient.evaluateAuthorization({
      action: 'execute_transaction',
      transaction: unauthorizedPayload,
      currentDailySpendUcents: 0,
      guardSettings,
      taintStatus: 'UNTAINTED',
    });

    expect(decision.allow).toBe(false);
    expect(decision.reasons).toContain('UNAUTHORIZED_MERCHANT');
  });

  it('should deny authorization when daily spend limit is exceeded', async () => {
    const decision = await opaClient.evaluateAuthorization({
      action: 'execute_transaction',
      transaction: validPayload,
      currentDailySpendUcents: 48000000, // $48 + $5 = $53 > $50 limit
      guardSettings,
      taintStatus: 'UNTAINTED',
    });

    expect(decision.allow).toBe(false);
    expect(decision.reasons).toContain('DAILY_LIMIT_EXCEEDED');
  });
});
