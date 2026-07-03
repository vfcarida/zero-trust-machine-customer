import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { transmitPayloadOverZiti } from '@/lib/ziti_server';
import { verifyX402Payload } from '@/lib/agent_pay_protocol';

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

  const mockRequest = (body: any): Request => {
    return {
      json: async () => body,
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

  it('should return 401 Unauthorized if cryptographic signature verification fails', async () => {
    vi.mocked(verifyX402Payload).mockReturnValue(false);

    const req = mockRequest({ payload: validPayload, publicKey: 'pubkey123' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Cryptographic signature verification failed');
    expect(verifyX402Payload).toHaveBeenCalledWith(validPayload, 'pubkey123');
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
});
