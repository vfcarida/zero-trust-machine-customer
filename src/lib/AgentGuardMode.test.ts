import { describe, it, expect } from 'vitest';
import { evaluateTransaction, GuardSettings } from './AgentGuardMode';
import { X402Payload } from './agent_pay_protocol';

describe('Agent Guard Mode Evaluation', () => {
  const basePayload: X402Payload = {
    x402Version: '1.0.0',
    agentId: 'did:key:agent123',
    merchantId: 'aws_compute',
    intent: 'Procure cloud servers',
    amountUcents: 10000000, // $10.00 USD
    currency: 'USD',
    timestamp: '2026-07-03T12:00:00Z',
    nonce: 'nonce123',
    signature: 'sig123',
  };

  const defaultSettings: GuardSettings = {
    enabled: true,
    dailySpendLimitUcents: 50000000, // $50.00 USD
    allowlist: ['aws_compute', 'mcmaster_carr', 'google_cloud_m2m'],
  };

  it('should approve transactions immediately when Guard Mode is disabled', () => {
    const disabledSettings = { ...defaultSettings, enabled: false };
    const result = evaluateTransaction(basePayload, 60000000, disabledSettings); // Limit already exceeded in day
    
    expect(result.approved).toBe(true);
    expect(result.details?.violatesLimit).toBe(false);
    expect(result.details?.violatesMerchant).toBe(false);
  });

  it('should approve transaction when within budget and merchant is in allowlist', () => {
    const result = evaluateTransaction(basePayload, 20000000, defaultSettings); // 20 + 10 = 30 USD (Limit is 50)
    
    expect(result.approved).toBe(true);
    expect(result.details?.violatesLimit).toBe(false);
    expect(result.details?.violatesMerchant).toBe(false);
  });

  it('should reject transaction when merchant is not in the allowlist', () => {
    const payload = { ...basePayload, merchantId: 'rogue_merchant_shop' };
    const result = evaluateTransaction(payload, 10000000, defaultSettings);
    
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('not in the allowlist');
    expect(result.details?.merchantApproved).toBe(false);
    expect(result.details?.violatesMerchant).toBe(true);
  });

  it('should check allowlist in a case-insensitive and trimmed manner', () => {
    const payload1 = { ...basePayload, merchantId: '  AWS_COMPUTE  ' };
    const result1 = evaluateTransaction(payload1, 10000000, defaultSettings);
    expect(result1.approved).toBe(true);

    const payload2 = { ...basePayload, merchantId: 'mcmaster_carr' };
    const result2 = evaluateTransaction(payload2, 10000000, defaultSettings);
    expect(result2.approved).toBe(true);
  });

  it('should reject transaction when projected spending exceeds daily spend limit', () => {
    // Current spend is $45.00, transaction is $10.00 -> $55.00 (Exceeds $50.00 limit)
    const result = evaluateTransaction(basePayload, 45000000, defaultSettings);
    
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('spending limit exceeded');
    expect(result.details?.violatesLimit).toBe(true);
  });

  it('should approve transaction when projected spending is exactly at the limit boundary', () => {
    // Current spend is $40.00, transaction is $10.00 -> $50.00 (Exactly matches limit)
    const result = evaluateTransaction(basePayload, 40000000, defaultSettings);
    
    expect(result.approved).toBe(true);
    expect(result.details?.violatesLimit).toBe(false);
  });

  it('should handle negative daily spend input gracefully by resetting to zero', () => {
    // Passing -5000 ucents, evaluation handles it as 0 + 10 ucents = 10 ucents
    const result = evaluateTransaction(basePayload, -5000, defaultSettings);
    expect(result.approved).toBe(true);
    expect(result.details?.currentDailySpendUcents).toBe(0);
  });
});
