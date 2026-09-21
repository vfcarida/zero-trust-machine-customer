import { describe, it, expect } from 'vitest';
import { 
  validateX402PayloadStructure, 
  generateAgentKeyPair, 
  serializePayload, 
  signX402Payload, 
  verifyX402Payload, 
  processX402Settlement,
  X402Payload
} from './agent_pay_protocol';
import { DPoPManager, InMemoryDPoPReplayStore } from '../infrastructure/auth/dpop';

describe('Agent Pay Protocol (AP4M / x402)', () => {
  const validBasePayload = {
    x402Version: '1.0.0',
    agentId: 'did:key:z6MkqB3zV18',
    merchantId: 'aws_compute',
    intent: 'Refuel cores',
    amountUcents: 2500000,
    currency: 'USD',
    timestamp: '2026-07-03T12:00:00Z',
    nonce: 'abc123nonce',
  };

  describe('validateX402PayloadStructure', () => {
    it('should validate a correct payload structure', () => {
      expect(validateX402PayloadStructure(validBasePayload)).toBe(true);
    });

    it('should reject payloads with non-integer amounts', () => {
      const invalid = { ...validBasePayload, amountUcents: 250000.5 };
      expect(validateX402PayloadStructure(invalid)).toBe(false);
    });

    it('should reject payloads with zero or negative amounts', () => {
      expect(validateX402PayloadStructure({ ...validBasePayload, amountUcents: 0 })).toBe(false);
      expect(validateX402PayloadStructure({ ...validBasePayload, amountUcents: -100 })).toBe(false);
    });

    it('should reject payloads with missing keys', () => {
      const invalid = { ...validBasePayload } as any;
      delete invalid.merchantId;
      expect(validateX402PayloadStructure(invalid)).toBe(false);
    });

    it('should reject payloads with incorrect data types', () => {
      const invalid = { ...validBasePayload, amountUcents: '2500000' as any };
      expect(validateX402PayloadStructure(invalid)).toBe(false);
    });
  });

  describe('generateAgentKeyPair', () => {
    it('should generate valid RSA-2048 keypair PEM strings', () => {
      const keypair = generateAgentKeyPair();
      expect(keypair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keypair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });
  });

  describe('serializePayload', () => {
    it('should serialize fields in alphabetical key order', () => {
      const serialized = serializePayload(validBasePayload);
      const parsed = JSON.parse(serialized);
      expect(parsed.amountUcents).toBe(validBasePayload.amountUcents);
      expect(parsed.merchantId).toBe(validBasePayload.merchantId);
      
      const keys = Object.keys(parsed);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify payloads successfully using generated keypair', () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);

      const payloadWithSig: X402Payload = { ...validBasePayload, signature };
      const verification = verifyX402Payload(payloadWithSig, keys.publicKey);
      expect(verification).toBe(true);
    });

    describe('Adversarial Suite (E1) - fail-closed signing & signature verification', () => {
      it('should fail closed and throw on signing error with invalid or empty private key', () => {
        expect(() => signX402Payload(validBasePayload, 'invalid-pem-key')).toThrow();
        expect(() => signX402Payload(validBasePayload, '')).toThrow();
      });

      it('should reject simulated signature prefixes (sim_sig_*) unconditionally', () => {
        const keys = generateAgentKeyPair();
        const forgedPayload: X402Payload = {
          ...validBasePayload,
          signature: 'sim_sig_0123456789abcdef0123456789abcdef',
        };
        expect(verifyX402Payload(forgedPayload, keys.publicKey)).toBe(false);
        expect(verifyX402Payload(forgedPayload, 'some-public-key')).toBe(false);
      });

      it('should reject empty, whitespace, or missing signatures', () => {
        const keys = generateAgentKeyPair();
        const emptySigPayload: X402Payload = { ...validBasePayload, signature: '' };
        const whitespaceSigPayload: X402Payload = { ...validBasePayload, signature: '   ' };
        
        expect(verifyX402Payload(emptySigPayload, keys.publicKey)).toBe(false);
        expect(verifyX402Payload(whitespaceSigPayload, keys.publicKey)).toBe(false);
        expect(verifyX402Payload({ ...validBasePayload } as any, keys.publicKey)).toBe(false);
      });

      it('should reject a valid signature created for a different payload (mismatched payload / replay attack)', () => {
        const keys = generateAgentKeyPair();
        const differentPayload = { ...validBasePayload, amountUcents: 9999999 };
        const signatureForDifferent = signX402Payload(differentPayload, keys.privateKey);

        const tamperedPayload: X402Payload = { ...validBasePayload, signature: signatureForDifferent };
        expect(verifyX402Payload(tamperedPayload, keys.publicKey)).toBe(false);
      });

      it('should reject a valid signature verified against the wrong public key', () => {
        const keys1 = generateAgentKeyPair();
        const keys2 = generateAgentKeyPair();
        const signature = signX402Payload(validBasePayload, keys1.privateKey);
        const payloadWithSig: X402Payload = { ...validBasePayload, signature };

        expect(verifyX402Payload(payloadWithSig, keys2.publicKey)).toBe(false);
      });

      it('should reject verified payloads when signature is modified', () => {
        const keys = generateAgentKeyPair();
        const signature = signX402Payload(validBasePayload, keys.privateKey);
        const modifiedSignature = signature.startsWith('A') ? 'B' + signature.substring(1) : 'A' + signature.substring(1);
        const payloadWithSig: X402Payload = { ...validBasePayload, signature: modifiedSignature };
        
        expect(verifyX402Payload(payloadWithSig, keys.publicKey)).toBe(false);
      });
    });
  });

  describe('processX402Settlement', () => {
    it('should successfully settle valid signed transaction payloads', async () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };
      
      const settlement = await processX402Settlement(payloadWithSig, keys.publicKey, true);
      expect(settlement.success).toBe(true);
      expect(settlement.settledAmountUcents).toBe(validBasePayload.amountUcents);
      expect(settlement.zitiSecured).toBe(true);
      expect(settlement.authCode).toHaveLength(6);
    });

    it('should reject settlement for invalid payload structures', async () => {
      const invalidPayload = { ...validBasePayload, amountUcents: -2500 } as any;
      const settlement = await processX402Settlement(invalidPayload, 'some-key', false);
      expect(settlement.success).toBe(false);
      expect(settlement.error).toContain('Validation Failure');
    });

    it('should reject settlement for invalid signatures', async () => {
      const payloadWithSig: X402Payload = { ...validBasePayload, signature: 'bad_signature' };
      const settlement = await processX402Settlement(payloadWithSig, 'invalid-key', false);
      expect(settlement.success).toBe(false);
      expect(settlement.error).toContain('Cryptographic Verification Failure');
    });

    it('should reject settlement for simulated bypass signatures (sim_sig_*)', async () => {
      const keys = generateAgentKeyPair();
      const payloadWithSimSig: X402Payload = { ...validBasePayload, signature: 'sim_sig_0123456789abcdef' };
      const settlement = await processX402Settlement(payloadWithSimSig, keys.publicKey, false);
      expect(settlement.success).toBe(false);
      expect(settlement.error).toContain('Cryptographic Verification Failure');
    });

    it('should successfully settle when valid RFC 9449 DPoP proof is verified', async () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };

      const dpopManager = new DPoPManager();
      const dpopProof = await dpopManager.generateProof('POST', 'http://localhost:3000/api/transmit-ziti');

      const settlement = await processX402Settlement(
        payloadWithSig,
        keys.publicKey,
        true,
        dpopProof.jwt,
        { dpopManager }
      );

      expect(settlement.success).toBe(true);
      expect(settlement.authCode).toHaveLength(6);
    });

    it('should reject settlement when replayed DPoP proof is submitted', async () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };

      const replayStore = new InMemoryDPoPReplayStore();
      const dpopManager = new DPoPManager(undefined, replayStore);
      const dpopProof = await dpopManager.generateProof('POST', 'http://localhost:3000/api/transmit-ziti');

      // First settlement succeeds
      const settlement1 = await processX402Settlement(
        payloadWithSig,
        keys.publicKey,
        true,
        dpopProof.jwt,
        { dpopManager }
      );
      expect(settlement1.success).toBe(true);

      // Replayed proof settlement fails closed
      const settlement2 = await processX402Settlement(
        payloadWithSig,
        keys.publicKey,
        true,
        dpopProof.jwt,
        { dpopManager }
      );
      expect(settlement2.success).toBe(false);
      expect(settlement2.error).toContain('DPOP_REPLAY_DETECTED');
    });

    it('should reject settlement when DPoP proof timestamp is stale', async () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };

      const dpopManager = new DPoPManager();
      const staleIat = Math.floor(Date.now() / 1000) - 150;
      const staleProof = await dpopManager.generateProof(
        'POST',
        'http://localhost:3000/api/transmit-ziti',
        undefined,
        { iat: staleIat }
      );

      const settlement = await processX402Settlement(
        payloadWithSig,
        keys.publicKey,
        true,
        staleProof.jwt,
        { dpopManager }
      );
      expect(settlement.success).toBe(false);
      expect(settlement.error).toContain('DPOP_STALE_TIMESTAMP');
    });

    it('should reject settlement when DPoP is required but missing', async () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };

      const settlement = await processX402Settlement(
        payloadWithSig,
        keys.publicKey,
        true,
        undefined,
        { requireDPoP: true }
      );
      expect(settlement.success).toBe(false);
      expect(settlement.error).toContain('Missing RFC 9449 DPoP proof');
    });
  });
});
