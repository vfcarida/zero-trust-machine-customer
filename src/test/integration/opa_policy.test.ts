import { describe, it, expect, vi, afterEach } from 'vitest';
import { OPAClient } from '../../infrastructure/authorization/opa_client';
import { GuardSettings, X402Payload } from '../../domain/types';

describe('Integration: OPA Policy Resolution & Decision Engine (Suite E2)', () => {
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
    signature: 'valid_test_signature_rsa',
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Suite E2: Fail-Closed Enforcement & Provenance', () => {
    it('should FAIL CLOSED when OPA server is unreachable in strict mode', async () => {
      // Configure strict client pointing to unreachable port
      const strictClient = new OPAClient({
        serverUrl: 'http://127.0.0.1:59999/v1/data/machine_customer/authz',
        enforceStrict: true,
        timeoutMs: 100,
        maxRetries: 0,
      });

      const decision = await strictClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 0,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('OPA_SERVER_UNREACHABLE_FAIL_CLOSED');
      expect(decision.provenance).toBe('opa');
      expect(decision.evaluatedAt).toBeDefined();
    });

    it('should return OPA server decision with provenance "opa" when OPA is reachable', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            allow: true,
            deny_reason: [],
          },
        }),
      } as unknown as Response);

      const client = new OPAClient({
        serverUrl: 'http://opa:8181/v1/data/machine_customer/authz',
        enforceStrict: true,
      });

      const decision = await client.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 10000000,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(true);
      expect(decision.reasons).toHaveLength(0);
      expect(decision.provenance).toBe('opa');
    });

    it('should return OPA server denial with provenance "opa" when policy rejects transaction', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            allow: false,
            deny_reason: ['UNAUTHORIZED_MERCHANT', 'DAILY_LIMIT_EXCEEDED'],
          },
        }),
      } as unknown as Response);

      const client = new OPAClient({
        serverUrl: 'http://opa:8181/v1/data/machine_customer/authz',
        enforceStrict: true,
      });

      const decision = await client.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 50000000,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('UNAUTHORIZED_MERCHANT');
      expect(decision.reasons).toContain('DAILY_LIMIT_EXCEEDED');
      expect(decision.provenance).toBe('opa');
    });

    it('should fall back to embedded evaluator in non-strict dev mode and tag provenance as "embedded-dev"', async () => {
      const devClient = new OPAClient({
        serverUrl: 'http://127.0.0.1:59999/v1/data/machine_customer/authz',
        enforceStrict: false,
        timeoutMs: 100,
        maxRetries: 0,
      });

      const decision = await devClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 10000000,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(true);
      expect(decision.reasons).toHaveLength(0);
      expect(decision.provenance).toBe('embedded-dev');
    });

    it('should abort and fail closed when OPA fetch times out in strict mode', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      );

      const timeoutClient = new OPAClient({
        serverUrl: 'http://opa:8181/v1/data/machine_customer/authz',
        enforceStrict: true,
        timeoutMs: 50,
        maxRetries: 0,
      });

      const decision = await timeoutClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 0,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('OPA_SERVER_UNREACHABLE_FAIL_CLOSED');
      expect(decision.provenance).toBe('opa');
    });
  });

  describe('Embedded Rule Semantics (Dev Fallback)', () => {
    const devClient = new OPAClient({
      serverUrl: 'http://127.0.0.1:59999/unreachable',
      enforceStrict: false,
      timeoutMs: 50,
      maxRetries: 0,
    });

    it('should deny authorization when merchant is not in allowlist', async () => {
      const unauthorizedPayload = { ...validPayload, merchantId: 'untrusted_vendor_x' };
      const decision = await devClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: unauthorizedPayload,
        currentDailySpendUcents: 0,
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('UNAUTHORIZED_MERCHANT');
      expect(decision.provenance).toBe('embedded-dev');
    });

    it('should deny authorization when daily spend limit is exceeded', async () => {
      const decision = await devClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 48000000, // $48 + $5 = $53 > $50 limit
        guardSettings,
        taintStatus: 'UNTAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('DAILY_LIMIT_EXCEEDED');
      expect(decision.provenance).toBe('embedded-dev');
    });

    it('should deny authorization when payload is TAINTED', async () => {
      const decision = await devClient.evaluateAuthorization({
        action: 'execute_transaction',
        transaction: validPayload,
        currentDailySpendUcents: 0,
        guardSettings,
        taintStatus: 'TAINTED',
      });

      expect(decision.allow).toBe(false);
      expect(decision.reasons).toContain('TAINTED_PAYLOAD_HITL_REQUIRED');
      expect(decision.provenance).toBe('embedded-dev');
    });
  });
});
