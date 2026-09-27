import { describe, it, expect } from 'vitest';
import { SpiffeWorkloadIdentity, validateSpiffeWorkloadId } from '../../infrastructure/auth/spiffe';
import { SpiffeIdentityError } from '../../domain/errors/domain_errors';

describe('SPIFFE Synthetic Workload Identity Handler (ZTMC-T08 Honest Labeling)', () => {
  it('should generate a synthetic SVID explicitly tagged as simulated and synthetic', async () => {
    const handler = new SpiffeWorkloadIdentity('zero-trust.machine.customer');
    const svid = await handler.fetchX509Svid();

    // Honest simulation labels
    expect(svid.simulated).toBe(true);
    expect(svid.synthetic).toBe(true);
    expect(svid.provenance).toBe('synthetic-local-dev');
    expect(svid.notes).toContain('Synthetic SPIFFE SVID generated locally');

    // SPIFFE ID verification
    expect(svid.spiffeId).toBe('spiffe://zero-trust.machine.customer/workload/machine-customer-agent');
    expect(new Date(svid.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('should emit a raw SPKI public key and NEVER claim or format it as an X.509 certificate', async () => {
    const handler = new SpiffeWorkloadIdentity('zero-trust.machine.customer');
    const svid = await handler.fetchX509Svid();

    // The key must be a valid PEM public key
    expect(svid.rawPublicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(svid.rawPublicKeyPem).toContain('-----END PUBLIC KEY-----');

    // Must NOT contain an X.509 certificate header (honest framing per ZTMC-F06 / S-ZT-5)
    expect(svid.rawPublicKeyPem).not.toContain('-----BEGIN CERTIFICATE-----');
    expect(svid.rawPublicKeyPem).not.toContain('-----END CERTIFICATE-----');

    // Private key is formatted as PKCS#8 PEM
    expect(svid.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('should cache and return the active synthetic SVID', async () => {
    const handler = new SpiffeWorkloadIdentity();
    expect(handler.getActiveSvid()).toBeUndefined();

    const svid = await handler.fetchX509Svid();
    expect(handler.getActiveSvid()).toBe(svid);
  });

  it('should reject invalid trust domain that results in an invalid SPIFFE ID', async () => {
    // A trust domain containing spaces or invalid characters
    const handler = new SpiffeWorkloadIdentity('invalid trust domain with spaces');
    await expect(handler.fetchX509Svid()).rejects.toThrow(SpiffeIdentityError);
  });
});

describe('SPIFFE ID Canonical Validation & Parsing (ZTMC-AUDIT-012)', () => {
  it('should validate and parse a fully conforming SPIFFE ID', () => {
    const rawId = 'spiffe://zero-trust.machine.customer/workload/payment-settler';
    const result = validateSpiffeWorkloadId(rawId, {
      expectedTrustDomain: 'zero-trust.machine.customer',
      expectedWorkloadPrefix: '/workload',
    });

    expect(result.isValid).toBe(true);
    expect(result.trustDomain).toBe('zero-trust.machine.customer');
    expect(result.path).toBe('/workload/payment-settler');
    expect(result.workloadId).toBe('payment-settler');
    expect(result.error).toBeUndefined();
  });

  it('should reject invalid URI schemes (non-spiffe)', () => {
    const res1 = validateSpiffeWorkloadId('https://zero-trust.machine.customer/workload/agent');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain('Invalid scheme: expected "spiffe:"');

    const res2 = validateSpiffeWorkloadId('urn:spiffe:zero-trust:workload');
    expect(res2.isValid).toBe(false);
  });

  it('should reject path traversal attempts fail-closed', () => {
    const traversalIds = [
      'spiffe://prod.internal/workload/../admin',
      'spiffe://prod.internal/./workload',
      'spiffe://prod.internal/workload/..',
    ];

    for (const id of traversalIds) {
      const res = validateSpiffeWorkloadId(id);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('directory traversal');
    }
  });

  it('should reject URI components forbidden by SPIFFE standard (query, fragment, userinfo, port)', () => {
    expect(validateSpiffeWorkloadId('spiffe://domain/workload?query=1').isValid).toBe(false);
    expect(validateSpiffeWorkloadId('spiffe://domain/workload#fragment').isValid).toBe(false);
    expect(validateSpiffeWorkloadId('spiffe://admin:pass@domain/workload').isValid).toBe(false);
    expect(validateSpiffeWorkloadId('spiffe://domain:8080/workload').isValid).toBe(false);
  });

  it('should enforce trust domain matching and handle subdomain matching when enabled', () => {
    const rawId = 'spiffe://cluster-a.zero-trust.machine.customer/workload/agent-1';

    // Strict exact match fails
    const strictRes = validateSpiffeWorkloadId(rawId, {
      expectedTrustDomain: 'zero-trust.machine.customer',
      allowSubdomains: false,
    });
    expect(strictRes.isValid).toBe(false);
    expect(strictRes.error).toContain('does not match expected domain');

    // Subdomain match succeeds
    const subRes = validateSpiffeWorkloadId(rawId, {
      expectedTrustDomain: 'zero-trust.machine.customer',
      allowSubdomains: true,
    });
    expect(subRes.isValid).toBe(true);
    expect(subRes.trustDomain).toBe('cluster-a.zero-trust.machine.customer');
  });

  it('should reject trailing slashes and empty segments', () => {
    expect(validateSpiffeWorkloadId('spiffe://domain/workload/').isValid).toBe(false);
    expect(validateSpiffeWorkloadId('spiffe://domain//workload').isValid).toBe(false);
  });
});

