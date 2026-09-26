import crypto from 'crypto';

import { X402Payload, X402SettlementResponse } from '../domain/types';
export type { X402Payload, X402SettlementResponse };

/**
 * Validates the structure and content of an x402 payload.
 * Prevents injection attacks and integrity violations.
 */
export function validateX402PayloadStructure(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  
  const requiredKeys = [
    'x402Version', 'agentId', 'merchantId', 'intent', 
    'amountUcents', 'currency', 'timestamp', 'nonce'
  ];
  
  for (const key of requiredKeys) {
    if (p[key] === undefined || p[key] === null) {
      return false;
    }
  }

  // Ensure amount is a strictly positive, non-floating, non-NaN integer
  if (
    typeof p.amountUcents !== 'number' ||
    isNaN(p.amountUcents) ||
    p.amountUcents <= 0 ||
    !Number.isInteger(p.amountUcents)
  ) {
    return false;
  }

  // Basic string constraints validation
  if (
    typeof p.x402Version !== 'string' ||
    typeof p.agentId !== 'string' ||
    typeof p.merchantId !== 'string' ||
    typeof p.intent !== 'string' ||
    typeof p.currency !== 'string' ||
    typeof p.timestamp !== 'string' ||
    typeof p.nonce !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Generates an RSA key pair for the machine customer agent.
 * In a production wallet deployment, this represents the delegated agent wallet credentials.
 */
export function generateAgentKeyPair(): { publicKey: string; privateKey: string } {
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return { publicKey, privateKey };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Fatal error during cryptographic keypair generation:', error);
    throw new Error(`Crypto keypair generation failed: ${msg}`);
  }
}

/**
 * Helper to serialize core payload fields deterministically.
 * Orders keys alphabetically to guarantee signature stability.
 */
export function serializePayload(payload: Omit<X402Payload, 'signature'>): string {
  return JSON.stringify({
    agentId: payload.agentId,
    amountUcents: payload.amountUcents,
    currency: payload.currency,
    intent: payload.intent,
    merchantId: payload.merchantId,
    nonce: payload.nonce,
    timestamp: payload.timestamp,
    x402Version: payload.x402Version,
  });
}

/**
 * Signs an x402 payload cryptographically using the agent's private key.
 * Enforces fail-closed semantics: throws on any signing error or invalid key.
 */
export function signX402Payload(
  payloadWithoutSignature: Omit<X402Payload, 'signature'>,
  privateKeyPem: string
): string {
  if (!privateKeyPem || typeof privateKeyPem !== 'string' || !privateKeyPem.trim()) {
    throw new Error('Private key PEM is empty or undefined.');
  }
  try {
    const data = serializePayload(payloadWithoutSignature);
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKeyPem, 'base64');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Cryptographic signature generation failed:', msg);
    throw new Error(`Signing failed: ${msg}`);
  }
}

/**
 * Verifies the cryptographic signature of the x402 payload using the agent's public key.
 * Fail-closed: returns true strictly for a cryptographically valid RSA-SHA256 signature
 * over the canonicalized payload matching the provided public key.
 */
export function verifyX402Payload(payload: X402Payload, publicKeyPem: string): boolean {
  try {
    if (!payload || !payload.signature || typeof payload.signature !== 'string' || !payload.signature.trim()) {
      return false;
    }

    if (!publicKeyPem || typeof publicKeyPem !== 'string' || !publicKeyPem.trim()) {
      return false;
    }

    const data = serializePayload(payload);
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    verify.end();
    return verify.verify(publicKeyPem, payload.signature, 'base64');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Cryptographic signature verification failed:', msg);
    return false;
  }
}


