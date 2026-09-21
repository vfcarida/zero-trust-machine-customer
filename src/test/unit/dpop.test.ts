import { describe, it, expect, beforeEach } from 'vitest';
import * as jose from 'jose';
import {
  DPoPManager,
  InMemoryDPoPReplayStore,
} from '../../infrastructure/auth/dpop';

describe('RFC 9449 DPoP Proof Manager (Suite E3: Adversarial & Replay Protection)', () => {
  let replayStore: InMemoryDPoPReplayStore;
  let dpop: DPoPManager;
  const testUrl = 'http://localhost:3000/api/transmit-ziti';

  beforeEach(() => {
    replayStore = new InMemoryDPoPReplayStore();
    dpop = new DPoPManager(undefined, replayStore);
  });

  it('(E3.1) should generate a real ES256 JWS with embedded public JWK conforming to RFC 9449', async () => {
    const proof = await dpop.generateProof('POST', testUrl, 'token_xyz_123');

    expect(proof.jti).toBeDefined();
    expect(proof.htm).toBe('POST');
    expect(proof.htu).toBe(testUrl);
    expect(proof.ath).toBeDefined();
    expect(proof.jwt).toBeDefined();

    // Verify compact JWS header structure
    const header = jose.decodeProtectedHeader(proof.jwt);
    expect(header.typ).toBe('dpop+jwt');
    expect(header.alg).toBe('ES256');
    expect(header.jwk).toBeDefined();
    expect(header.jwk?.kty).toBe('EC');
    expect(header.jwk?.crv).toBe('P-256');
    expect(header.jwk?.x).toBeDefined();
    expect(header.jwk?.y).toBeDefined();

    // RFC 9449 Section 4.2: MUST NOT contain private key components
    expect((header.jwk as Record<string, unknown>).d).toBeUndefined();
  });

  it('(E3.2) should verify a valid DPoP proof successfully against embedded JWK', async () => {
    const proof = await dpop.generateProof('POST', testUrl, 'token_xyz_123');

    const result = await dpop.verifyProofWithDetails(proof, 'POST', testUrl, {
      accessToken: 'token_xyz_123',
    });

    expect(result.valid).toBe(true);
    expect(result.jti).toBe(proof.jti);
    expect(result.thumbprint).toBeDefined();
    expect(result.claims?.htm).toBe('POST');
    expect(result.claims?.htu).toBe(testUrl);

    // Convenience boolean wrapper
    const replayStore2 = new InMemoryDPoPReplayStore();
    const dpop2 = new DPoPManager(undefined, replayStore2);
    const proof2 = await dpop2.generateProof('POST', testUrl);
    const isValid = await dpop2.verifyProof(proof2, 'POST', testUrl);
    expect(isValid).toBe(true);
  });

  it('(E3.3) should reject replayed JTI (single-use replay protection)', async () => {
    const proof = await dpop.generateProof('POST', testUrl);

    // First presentation: valid
    const firstResult = await dpop.verifyProofWithDetails(proof, 'POST', testUrl);
    expect(firstResult.valid).toBe(true);

    // Replay presentation: denied fail-closed
    const replayResult = await dpop.verifyProofWithDetails(proof, 'POST', testUrl);
    expect(replayResult.valid).toBe(false);
    expect(replayResult.error).toBe('DPOP_REPLAY_DETECTED');
    expect(replayResult.jti).toBe(proof.jti);
  });

  it('(E3.4) should reject stale iat beyond the 60s freshness window', async () => {
    const staleTime = Math.floor(Date.now() / 1000) - 120; // 120s in the past
    const staleProof = await dpop.generateProof('POST', testUrl, undefined, {
      iat: staleTime,
    });

    const result = await dpop.verifyProofWithDetails(staleProof, 'POST', testUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DPOP_STALE_TIMESTAMP');
  });

  it('(E3.5) should reject future iat beyond the 60s freshness window', async () => {
    const futureTime = Math.floor(Date.now() / 1000) + 120; // 120s in future
    const futureProof = await dpop.generateProof('POST', testUrl, undefined, {
      iat: futureTime,
    });

    const result = await dpop.verifyProofWithDetails(futureProof, 'POST', testUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DPOP_STALE_TIMESTAMP');
  });

  it('(E3.6) should reject proof with mismatched HTTP method (htm)', async () => {
    const proof = await dpop.generateProof('POST', testUrl);

    const result = await dpop.verifyProofWithDetails(proof, 'GET', testUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DPOP_HTM_MISMATCH');
  });

  it('(E3.7) should reject proof with mismatched HTTP URI (htu)', async () => {
    const proof = await dpop.generateProof('POST', testUrl);

    const result = await dpop.verifyProofWithDetails(
      proof,
      'POST',
      'http://localhost:3000/api/different-service'
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DPOP_HTU_MISMATCH');
  });

  it('(E3.8) should reject keyless or simulated bypass tokens (sim_ / sim_sig_)', async () => {
    const forgedTokens = [
      'sim_dpop_proof_token_123',
      'sim_sig_mastercard_bypass_token',
      'sim_eyJhbGciOiJFUzI1NiJ9.eyJqdGkiOiIxMjMifQ.abc',
    ];

    for (const forgedToken of forgedTokens) {
      const result = await dpop.verifyProofWithDetails(forgedToken, 'POST', testUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('DPOP_FORBIDDEN_SIMULATED_TOKEN');
    }
  });

  it('(E3.9) should reject JWK containing private key components (RFC 9449 Section 4.2)', async () => {
    // Generate an EC key and intentionally place the private component 'd' into the header JWK
    const { privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
    const fullJwk = await jose.exportJWK(privateKey); // contains 'd'

    const maliciousJwt = await new jose.SignJWT({
      htm: 'POST',
      htu: testUrl,
    })
      .setProtectedHeader({
        typ: 'dpop+jwt',
        alg: 'ES256',
        jwk: fullJwk, // Insecurely contains private key parameter
      })
      .setJti('jti_malicious_leak')
      .setIssuedAt()
      .sign(privateKey);

    const result = await dpop.verifyProofWithDetails(maliciousJwt, 'POST', testUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('DPOP_SECURITY_VIOLATION: JWK contains private key material');
  });

  it('(E3.10) should reject forged or tampered JWS signatures', async () => {
    const proof = await dpop.generateProof('POST', testUrl);
    const parts = proof.jwt.split('.');
    // Tamper with payload by mutating base64 character
    const tamperedPayload = parts[1].slice(0, -2) + 'AA';
    const tamperedJwt = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = await dpop.verifyProofWithDetails(tamperedJwt, 'POST', testUrl);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('DPOP_VERIFICATION_FAILED');
  });

  it('(E3.11) should verify access token hash (ath) binding correctly', async () => {
    const tokenA = 'oauth2_token_alpha_999';
    const tokenB = 'oauth2_token_beta_888';

    const proof = await dpop.generateProof('POST', testUrl, tokenA);

    // Matching token passes
    const validResult = await dpop.verifyProofWithDetails(proof, 'POST', testUrl, {
      accessToken: tokenA,
    });
    expect(validResult.valid).toBe(true);

    // Mismatched token fails closed
    const invalidResult = await dpop.verifyProofWithDetails(proof, 'POST', testUrl, {
      accessToken: tokenB,
      skipReplayCheck: true,
    });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toBe('DPOP_ATH_MISMATCH');
  });

  it('(E3.12) should automatically evict expired entries in InMemoryDPoPReplayStore', () => {
    const store = new InMemoryDPoPReplayStore();
    const pastTime = Math.floor(Date.now() / 1000) - 10;
    const futureTime = Math.floor(Date.now() / 1000) + 60;

    // Record an expired entry and an active entry
    store.recordIfUnseen('jti_expired', pastTime);
    store.recordIfUnseen('jti_active', futureTime);

    // Cleanup happens automatically on access
    expect(store.has('jti_expired')).toBe(false);
    expect(store.has('jti_active')).toBe(true);
    expect(store.size()).toBe(1);
  });
});
