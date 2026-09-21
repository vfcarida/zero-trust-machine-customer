import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { transmitPayloadOverZiti } from '@/lib/ziti_server';
import { verifyX402Payload } from '@/lib/agent_pay_protocol';
import { DPoPManager } from '@/infrastructure/auth/dpop';

vi.mock('@/lib/ziti_server', () => ({
  transmitPayloadOverZiti: vi.fn(),
}));

vi.mock('@/lib/agent_pay_protocol', () => ({
  verifyX402Payload: vi.fn(),
}));

describe('Transmit Ziti API Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPayload = {
    x402Version: '1.0.0',
    agentId: 'did:key:agent123',
    merchantId: 'aws_compute',
    intent: 'Procure core instance resources',
    amountUcents: 5000000,
    currency: 'USD',
    timestamp: '2026-07-03T12:00:00Z',
    nonce: 'nonce123',
    signature: 'validsig123',
  };

  const mockRequest = (body: any, headers: Record<string, string> = {}): Request => {
    return {
      method: 'POST',
      url: 'http://localhost:3000/api/transmit-ziti',
      json: async () => body,
      headers: {
        get: (name: string) => headers[name] || headers[name.toLowerCase()] || null,
      },
    } as unknown as Request;
  };

  it('should return 400 Bad Request if payload or public key is missing', async () => {
    const req = mockRequest({ payload: validPayload });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Missing payment payload or agent public key');
  });

  it('should return 400 Bad Request if payload signature is missing or empty', async () => {
    const payloadWithoutSig = { ...validPayload, signature: '' };
    const req = mockRequest({ payload: payloadWithoutSig, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Missing or empty cryptographic signature');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });

  it('should return 401 Unauthorized if cryptographic signature verification fails and not proceed to transmission', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(false);

    const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Cryptographic signature verification failed');
    expect(verifyX402Payload).toHaveBeenCalledWith(validPayload, 'pubkey123');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });

  it('should reject forged sim_sig payload with HTTP 401 and never proceed to transmission when unmocked verification runs', async () => {
    const actualProtocol = await vi.importActual<typeof import('@/lib/agent_pay_protocol')>('@/lib/agent_pay_protocol');
    vi.mocked(verifyX402Payload).mockImplementation((payload, pubKey) => actualProtocol.verifyX402Payload(payload, pubKey));

    const forgedPayload = { ...validPayload, signature: 'sim_sig_forged_payload_signature_123' };
    const req = mockRequest({ payload: forgedPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Cryptographic signature verification failed');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });

  it('should return 502 Bad Gateway if OpenZiti transmission returns failure', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);
    vi.mocked(transmitPayloadOverZiti).mockResolvedValue({
      success: false,
      logs: ['[Ziti Router] Failed to route to mesh service'],
      error: 'Mesh connection timeout error',
    });

    const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Mesh connection timeout error');
    expect(transmitPayloadOverZiti).toHaveBeenCalledWith('ap4m-settlement-service', validPayload);
  });

  it('should return 200 OK with logs and payload on successful mesh settlement routing', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);
    
    const mockSuccessResponse = {
      success: true,
      transactionId: 'tx_ziti_abc123',
      settledAmountUcents: 5000000,
      currency: 'USD',
      merchantId: 'aws_compute',
      authCode: '654321',
      timestamp: '2026-07-03T12:00:05Z',
      zitiSecured: true,
    };

    vi.mocked(transmitPayloadOverZiti).mockResolvedValue({
      success: true,
      logs: ['[Ziti SDK] Routing data to mesh service', '[Ziti SDK] Completed mTLS handshake'],
      responsePayload: mockSuccessResponse,
    });

    const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.logs).toHaveLength(2);
    expect(data.responsePayload).toEqual(mockSuccessResponse);
  });

  it('should handle internal errors gracefully returning 500 status', async () => {
    vi.mocked(verifyX402Payload).mockImplementation(() => {
      throw new Error('Unexpected fatal encryption library error');
    });

    const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Unexpected fatal encryption library error');
    expect(data.logs[0]).toContain('Unexpected fatal encryption library error');
  });

  it('should return 403 Forbidden and block transmission when OPA policy denies unauthorized merchant', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);

    const unauthorizedPayload = {
      ...validPayload,
      merchantId: 'rogue_untrusted_merchant',
    };

    const req = mockRequest({ payload: unauthorizedPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.error).toContain('OPA Policy Authorization Denied: UNAUTHORIZED_MERCHANT');
    expect(data.logs[0]).toContain('Policy Denied (embedded-dev): UNAUTHORIZED_MERCHANT');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });

  it('should return 403 Forbidden and fail closed when OPA server is unreachable in strict mode', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);
    const originalEnv = process.env.OPA_ENFORCE_STRICT;
    process.env.OPA_ENFORCE_STRICT = 'true';

    try {
      const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('OPA Policy Authorization Denied: OPA_SERVER_UNREACHABLE_FAIL_CLOSED');
      expect(data.logs[0]).toContain('Policy Denied (opa): OPA_SERVER_UNREACHABLE_FAIL_CLOSED');
      expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
    } finally {
      process.env.OPA_ENFORCE_STRICT = originalEnv;
    }
  });

  it('should successfully process request when valid RFC 9449 DPoP header is supplied', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);
    vi.mocked(transmitPayloadOverZiti).mockResolvedValue({
      success: true,
      logs: ['[Ziti SDK] Verified dark route'],
      responsePayload: { success: true, transactionId: 'tx_dpop_ok_1' },
    });

    const dpopManager = new DPoPManager();
    const proof = await dpopManager.generateProof('POST', 'http://localhost:3000/api/transmit-ziti');

    const req = mockRequest(
      { payload: validPayload, publicKey: 'pubkey123' },
      { DPoP: proof.jwt }
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(transmitPayloadOverZiti).toHaveBeenCalled();
  });

  it('should return 401 Unauthorized when replayed DPoP header is supplied', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);
    vi.mocked(transmitPayloadOverZiti).mockResolvedValue({
      success: true,
      logs: [],
      responsePayload: { success: true },
    });

    const dpopManager = new DPoPManager();
    const proof = await dpopManager.generateProof('POST', 'http://localhost:3000/api/transmit-ziti');

    // First request with proof succeeds
    const req1 = mockRequest(
      { payload: validPayload, publicKey: 'pubkey123' },
      { DPoP: proof.jwt }
    );
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);

    // Replay presentation of same DPoP proof is rejected fail-closed
    const req2 = mockRequest(
      { payload: validPayload, publicKey: 'pubkey123' },
      { DPoP: proof.jwt }
    );
    const res2 = await POST(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(401);
    expect(data2.success).toBe(false);
    expect(data2.error).toContain('DPOP_REPLAY_DETECTED');
  });

  it('should return 401 Unauthorized when stale DPoP header is supplied', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);

    const dpopManager = new DPoPManager();
    const staleTime = Math.floor(Date.now() / 1000) - 150;
    const staleProof = await dpopManager.generateProof(
      'POST',
      'http://localhost:3000/api/transmit-ziti',
      undefined,
      { iat: staleTime }
    );

    const req = mockRequest(
      { payload: validPayload, publicKey: 'pubkey123' },
      { DPoP: staleProof.jwt }
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('DPOP_STALE_TIMESTAMP');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });

  it('should return 401 Unauthorized when simulated DPoP proof is supplied', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(true);

    const req = mockRequest(
      { payload: validPayload, publicKey: 'pubkey123' },
      { DPoP: 'sim_dpop_bypass_proof_header' }
    );
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('DPOP_FORBIDDEN_SIMULATED_TOKEN');
    expect(transmitPayloadOverZiti).not.toHaveBeenCalled();
  });
});


