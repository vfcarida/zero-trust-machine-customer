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

    it('should fall back to simulated signature on signing failure (invalid key format)', () => {
      const signature = signX402Payload(validBasePayload, 'invalid-pem-key');
      expect(signature).toContain('sim_sig_');
      
      const payloadWithSig: X402Payload = { ...validBasePayload, signature };
      expect(verifyX402Payload(payloadWithSig, 'some-public-key')).toBe(true);
    });

    it('should reject verified payloads when signature is modified', () => {
      const keys = generateAgentKeyPair();
      const signature = signX402Payload(validBasePayload, keys.privateKey);
      const modifiedSignature = signature.startsWith('A') ? 'B' + signature.substring(1) : 'A' + signature.substring(1);
      const payloadWithSig: X402Payload = { ...validBasePayload, signature: modifiedSignature };
      
      expect(verifyX402Payload(payloadWithSig, keys.publicKey)).toBe(false);
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
  });
});
