import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HttpSettlementProvider,
  createSettlementProvider,
  MockSettlementProvider,
} from '../../infrastructure/settlement/settlement_provider';
import { X402Payload } from '../../domain/types';

describe('HttpSettlementProvider & Factory', () => {
  const samplePayload: X402Payload = {
    x402Version: '1.0.0',
    agentId: 'did:key:agent123',
    merchantId: 'aws_compute',
    intent: 'Procure 32 Cores',
    amountUcents: 8000000,
    currency: 'USD',
    timestamp: '2026-09-25T12:00:00Z',
    nonce: 'nonce_999',
    signature: 'sig_rsa_valid',
  };

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it('dispatches payment to gateway and returns SETTLED on 200 OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'SETTLED',
        authCode: 'AUTH_654321',
        networkTransactionId: 'net_tx_888',
      }),
    });

    const provider = new HttpSettlementProvider({
      gatewayUrl: 'https://settlement.bank.internal',
      apiKey: 'secret_key_123',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.executeSettlement({
      transactionId: 'tx_001',
      payload: samplePayload,
      dpopProof: 'dpop_jwt_proof',
      zitiSecured: true,
    });

    expect(result.status).toBe('SETTLED');
    expect(result.authCode).toBe('AUTH_654321');
    expect(result.networkTransactionId).toBe('net_tx_888');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://settlement.bank.internal/v1/settlements',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret_key_123',
          DPoP: 'dpop_jwt_proof',
          'X-OpenZiti-Secured': 'true',
          'X-Idempotency-Key': 'nonce_999',
        }),
      })
    );
  });

  it('translates 5xx server errors into AMBIGUOUS for state machine reconciliation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Service Unavailable' }),
    });

    const provider = new HttpSettlementProvider({
      gatewayUrl: 'https://settlement.bank.internal',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.executeSettlement({
      transactionId: 'tx_002',
      payload: samplePayload,
      zitiSecured: false,
    });

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.error).toContain('RAIL_SERVER_ERROR (503)');
  });

  it('translates network drops or timeouts into AMBIGUOUS', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET: Connection dropped by peer'));

    const provider = new HttpSettlementProvider({
      gatewayUrl: 'https://settlement.bank.internal',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.executeSettlement({
      transactionId: 'tx_003',
      payload: samplePayload,
      zitiSecured: false,
    });

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.error).toContain('RAIL_NETWORK_ERROR: ECONNRESET');
  });

  it('reconciles ambiguous transactions against remote gateway', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'SETTLED',
        authCode: 'RECON_111',
        networkTransactionId: 'net_recon_222',
      }),
    });

    const provider = new HttpSettlementProvider({
      gatewayUrl: 'https://settlement.bank.internal',
      apiKey: 'k1',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const result = await provider.reconcile('tx_ambig_1', samplePayload);
    expect(result.status).toBe('SETTLED');
    expect(result.authCode).toBe('RECON_111');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://settlement.bank.internal/v1/settlements/tx_ambig_1?nonce=nonce_999',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('compensates and voids unsettled intents via gateway endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ compensationId: 'comp_custom_99' }),
    });

    const provider = new HttpSettlementProvider({
      gatewayUrl: 'https://settlement.bank.internal',
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const comp = await provider.compensate('tx_void_1', samplePayload, 'Rollback requested');
    expect(comp.compensated).toBe(true);
    expect(comp.compensationId).toBe('comp_custom_99');
  });

  it('factory selects MockSettlementProvider by default and HttpSettlementProvider when requested', () => {
    const defaultProvider = createSettlementProvider();
    expect(defaultProvider).toBeInstanceOf(MockSettlementProvider);

    const httpProvider = createSettlementProvider({
      mode: 'http',
      gatewayUrl: 'https://ap4m.bank.com',
    });
    expect(httpProvider).toBeInstanceOf(HttpSettlementProvider);
  });
});
