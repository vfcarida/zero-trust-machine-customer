import { describe, it, expect } from 'vitest';
import { DPoPManager } from '../../infrastructure/auth/dpop';

describe('RFC 9449 DPoP Proof Manager', () => {
  it('should generate a cryptographically valid DPoP proof', () => {
    const dpop = new DPoPManager();
    const proof = dpop.generateProof('POST', 'http://localhost:3000/api/transmit-ziti', 'token_123');

    expect(proof.jti).toBeDefined();
    expect(proof.htm).toBe('POST');
    expect(proof.htu).toBe('http://localhost:3000/api/transmit-ziti');
    expect(proof.ath).toBeDefined();
    expect(proof.signature).toBeDefined();
  });

  it('should verify a valid DPoP proof successfully', () => {
    const dpop = new DPoPManager();
    const proof = dpop.generateProof('POST', 'http://localhost:3000/api/transmit-ziti', 'token_123');
    const isValid = dpop.verifyProof(
      proof,
      'POST',
      'http://localhost:3000/api/transmit-ziti',
      dpop.getPublicKeyPem()
    );

    expect(isValid).toBe(true);
  });

  it('should reject proof if HTTP method or URL mismatch occurs', () => {
    const dpop = new DPoPManager();
    const proof = dpop.generateProof('POST', 'http://localhost:3000/api/transmit-ziti');
    const isValid = dpop.verifyProof(
      proof,
      'GET',
      'http://localhost:3000/api/transmit-ziti',
      dpop.getPublicKeyPem()
    );

    expect(isValid).toBe(false);
  });
});
