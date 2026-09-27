import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/health/route';
import { getAuditTrailManager } from '@/infrastructure/logging/audit_trail';

describe('Health & Probes API Route (/api/health)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockGetRequest = (url = 'http://localhost:3000/api/health'): Request => {
    return new Request(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  it('should return 200 OK with system metrics and checks on standard GET request', async () => {
    const req = mockGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(['UP', 'DEGRADED']).toContain(data.status);
    expect(data.timestamp).toBeDefined();
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.system.nodeVersion).toBeDefined();
    expect(data.system.memoryUsageMb).toBeGreaterThan(0);
    expect(data.checks).toBeDefined();
    expect(data.checks.spendLedger.status).toBe('UP');
    expect(data.checks.auditTrail.status).toBe('UP');
    expect(data.checks.auditTrail.verified).toBe(true);
  });

  it('should return fast 200 OK response on ?probe=liveness without heavy checks', async () => {
    const req = mockGetRequest('http://localhost:3000/api/health?probe=liveness');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('UP');
    expect(data.uptimeSeconds).toBeDefined();
    expect(data.checks).toBeUndefined(); // fast path skips subsystem diagnostics
  });

  it('should evaluate full subsystem diagnostics on ?probe=readiness', async () => {
    const req = mockGetRequest('http://localhost:3000/api/health?probe=readiness');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(['UP', 'DEGRADED']).toContain(data.status);
    expect(data.checks).toBeDefined();
    expect(data.checks.spendLedger).toBeDefined();
    expect(data.checks.opaPolicyEngine).toBeDefined();
    expect(data.checks.auditTrail).toBeDefined();
  });

  it('should return 503 Service Unavailable on readiness probe if audit trail is compromised', async () => {
    const auditMgr = getAuditTrailManager();
    vi.spyOn(auditMgr, 'verifyIntegrity').mockReturnValue({
      isValid: false,
      reason: 'Cryptographic hash chain broken at block 2',
      tamperedSequence: 2,
      totalRecords: 2,
    });

    const req = mockGetRequest('http://localhost:3000/api/health?probe=readiness');
    const res = await GET(req);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe('DOWN');
    expect(data.checks.auditTrail.status).toBe('DOWN');
    expect(data.checks.auditTrail.verified).toBe(false);
    expect(data.checks.auditTrail.error).toContain('Cryptographic hash chain broken');
  });

  it('should report DEGRADED in dev mode when OPA sidecar is unreachable', async () => {
    // With strict mode off (default)
    const req = mockGetRequest('http://localhost:3000/api/health');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    if (data.checks.opaPolicyEngine.mode === 'embedded-dev') {
      expect(data.checks.opaPolicyEngine.status).toBe('DEGRADED');
    }
  });
});
