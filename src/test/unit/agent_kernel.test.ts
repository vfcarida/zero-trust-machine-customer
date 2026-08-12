import { describe, it, expect, beforeEach } from 'vitest';
import { AgentKernel } from '../../application/kernel/agent_kernel';
import { GuardSettings, X402Payload, TrustedMetadataEnvelope } from '../../domain/types';
import { AgentKernelQuotaExceededError, SecurityPolicyViolationError } from '../../domain/errors/domain_errors';

describe('AgentKernel - Execution Kernel & Quota Safety', () => {
  let defaultSettings: GuardSettings;
  let samplePayload: X402Payload;
  let untaintedEnvelope: TrustedMetadataEnvelope;

  beforeEach(() => {
    defaultSettings = {
      enabled: true,
      dailySpendLimitUcents: 50000000, // $50.00 USD
      allowlist: ['aws_compute', 'partssource_corp'],
      maxRatePerMinute: 5,
    };

    samplePayload = {
      x402Version: '1.0.0',
      agentId: 'agent_test_001',
      merchantId: 'aws_compute',
      intent: 'Procure 500 Compute Hours',
      amountUcents: 10000000, // $10.00 USD
      currency: 'USD',
      timestamp: new Date().toISOString(),
      nonce: 'nonce_test_12345678',
      signature: 'sim_sig_valid',
    };

    untaintedEnvelope = {
      payloadId: 'env_test_01',
      source: 'telemetry',
      content: JSON.stringify(samplePayload),
      taintStatus: 'UNTAINTED',
      timestamp: new Date().toISOString(),
      requiresHITL: false,
    };
  });

  it('should successfully approve valid action execution within quota', async () => {
    const kernel = new AgentKernel(defaultSettings);
    const result = await kernel.interceptAndValidate({
      action: 'execute_transaction',
      payload: samplePayload,
      envelope: untaintedEnvelope,
    });

    expect(result.allowed).toBe(true);
    expect(kernel.getDailySpend()).toBe(10000000);
  });

  it('should enforce rate limiting quota when threshold is exceeded', async () => {
    const kernel = new AgentKernel(defaultSettings);

    for (let i = 0; i < 5; i++) {
      await kernel.interceptAndValidate({
        action: 'execute_transaction',
        payload: samplePayload,
        envelope: untaintedEnvelope,
      });
    }

    await expect(
      kernel.interceptAndValidate({
        action: 'execute_transaction',
        payload: samplePayload,
        envelope: untaintedEnvelope,
      })
    ).rejects.toThrow(AgentKernelQuotaExceededError);
  });

  it('should deny execution when OPA policy daily limit is breached', async () => {
    const kernel = new AgentKernel(defaultSettings);
    const expensivePayload = { ...samplePayload, amountUcents: 60000000 };

    await expect(
      kernel.interceptAndValidate({
        action: 'execute_transaction',
        payload: expensivePayload,
        envelope: untaintedEnvelope,
      })
    ).rejects.toThrow(SecurityPolicyViolationError);
  });
});
