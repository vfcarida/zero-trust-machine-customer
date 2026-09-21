import { describe, it, expect } from 'vitest';
import { SpiffeWorkloadIdentity } from '../../infrastructure/auth/spiffe';
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
