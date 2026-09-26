import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/audit-trail/route';
import { globalAuditTrail } from '@/infrastructure/logging/audit_trail';

describe('Audit Trail API Route (/api/audit-trail)', () => {
  beforeEach(() => {
    globalAuditTrail.clear();
  });

  const mockGetRequest = (url = 'http://localhost:3000/api/audit-trail'): Request => {
    return {
      method: 'GET',
      url,
      headers: {
        get: () => null,
      },
    } as unknown as Request;
  };

  const mockPostRequest = (body: unknown): Request => {
    return {
      method: 'POST',
      url: 'http://localhost:3000/api/audit-trail',
      json: async () => body,
      headers: {
        get: () => 'application/json',
      },
    } as unknown as Request;
  };

  it('GET should return JSON payload with records and integrity verification result', async () => {
    globalAuditTrail.recordEvent('AI_REASONING', { intent: 'evaluate_procurement' });
    globalAuditTrail.recordEvent('GUARD_MODE_EVAL', { allowed: true });

    const req = mockGetRequest();
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.verification.isValid).toBe(true);
    expect(data.records).toHaveLength(2);
    expect(data.records[0].previousHash).toBe('GENESIS');
    expect(data.records[1].previousHash).toBe(data.records[0].hash);
  });

  it('GET with ?format=jsonl should export standard NDJSON stream for SIEM ingestion', async () => {
    globalAuditTrail.recordEvent('TELEMETRY_SAMPLE', { coolantLevel: 14.2 });
    globalAuditTrail.recordEvent('DPOP_PROOF_VERIFIED', { jti: 'test-jti-123' });

    const req = mockGetRequest('http://localhost:3000/api/audit-trail?format=jsonl');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
    expect(res.headers.get('Content-Disposition')).toContain('audit_trail.jsonl');

    const bodyText = await res.text();
    const lines = bodyText.trim().split('\n');
    expect(lines).toHaveLength(2);

    const parsedFirst = JSON.parse(lines[0]);
    expect(parsedFirst.sequence).toBe(1);
    expect(parsedFirst.eventType).toBe('TELEMETRY_SAMPLE');
    expect(parsedFirst.data.coolantLevel).toBe(14.2);
  });

  it('POST with action: "record_event" should append a sealed record into the hash chain', async () => {
    const req = mockPostRequest({
      action: 'record_event',
      eventType: 'ADVERSARIAL_ATTACK_DETECTED',
      data: {
        threatCategory: 'DIRECT_INSTRUCTION_OVERRIDE',
        riskLevel: 'CRITICAL',
        mitigation: 'TAINTED_PAYLOAD_HITL_REQUIRED',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.record.sequence).toBe(1);
    expect(data.record.eventType).toBe('ADVERSARIAL_ATTACK_DETECTED');
    expect(data.record.hash).toBeDefined();
    expect(data.verification.isValid).toBe(true);
  });

  it('POST with action: "verify" should report integrity status of the audit chain', async () => {
    globalAuditTrail.recordEvent('AI_REASONING', { step: 1 });
    globalAuditTrail.recordEvent('SETTLEMENT_COMMENCED', { txId: 'tx_99' });

    const req = mockPostRequest({ action: 'verify' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.verification.isValid).toBe(true);
    expect(data.count).toBe(2);
  });

  it('POST with action: "simulate_tamper" should modify record in-place and cause verification to fail', async () => {
    globalAuditTrail.recordEvent('TELEMETRY_SAMPLE', { level: 50 });
    globalAuditTrail.recordEvent('GUARD_MODE_EVAL', { allowed: true });
    globalAuditTrail.recordEvent('SETTLEMENT_FINALIZED', { amountUcents: 5000000 });

    // Intentionally tamper with record sequence 2
    const tamperReq = mockPostRequest({
      action: 'simulate_tamper',
      sequence: 2,
      data: {
        allowed: false,
        forged: true,
      },
    });

    const tamperRes = await POST(tamperReq);
    expect(tamperRes.status).toBe(200);

    const tamperData = await tamperRes.json();
    expect(tamperData.success).toBe(true);
    expect(tamperData.verification.isValid).toBe(false);
    expect(tamperData.verification.tamperedSequence).toBe(2);

    // Verify integrity directly confirms tampering
    const verifyRes = await POST(mockPostRequest({ action: 'verify' }));
    const verifyData = await verifyRes.json();
    expect(verifyData.verification.isValid).toBe(false);
    expect(verifyData.verification.tamperedSequence).toBe(2);
  });

  it('POST with action: "clear" should reset audit history cleanly', async () => {
    globalAuditTrail.recordEvent('TELEMETRY_SAMPLE', { level: 20 });
    expect(globalAuditTrail.getRecordCount()).toBe(1);

    const clearReq = mockPostRequest({ action: 'clear' });
    const clearRes = await POST(clearReq);
    expect(clearRes.status).toBe(200);

    expect(globalAuditTrail.getRecordCount()).toBe(0);
  });
});
