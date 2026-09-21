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

import { DPoPManager } from '../infrastructure/auth/dpop';
import { DPoPProof } from '../domain/types';
import { SettlementService, globalSettlementService } from '../application/services/settlement_service';

export interface SettlementOptions {
  dpopProof?: string | DPoPProof;
  expectedMethod?: string;
  expectedUrl?: string;
  requireDPoP?: boolean;
  dpopManager?: DPoPManager;
  settlementService?: SettlementService;
}

/**
 * Simulates settlement processing on the vendor/acquirer side.
 * Validates cryptographic signature and enforces strict constraints before payout.
 * Verifies RFC 9449 DPoP proof at the settlement boundary when present or required.
 */
export async function processX402Settlement(
  payload: X402Payload,
  publicKeyPem: string,
  zitiSecured: boolean,
  dpopProofOrOptions?: string | DPoPProof | SettlementOptions,
  legacyOptions?: SettlementOptions
): Promise<X402SettlementResponse> {
  // 1. Enforce payload structural validation
  if (!validateX402PayloadStructure(payload)) {
    return {
      success: false,
      transactionId: `tx_err_${crypto.randomBytes(8).toString('hex')}`,
      settledAmountUcents: 0,
      currency: payload?.currency || 'USD',
      merchantId: payload?.merchantId || 'unknown',
      authCode: '000000',
      timestamp: new Date().toISOString(),
      zitiSecured,
      error: 'Invalid payload structure or values (Validation Failure)',
    };
  }

  // 2. Verify cryptographic agent signature
  const isValidSignature = verifyX402Payload(payload, publicKeyPem);
  if (!isValidSignature) {
    return {
      success: false,
      transactionId: `tx_err_${crypto.randomBytes(8).toString('hex')}`,
      settledAmountUcents: 0,
      currency: payload.currency,
      merchantId: payload.merchantId,
      authCode: '000000',
      timestamp: new Date().toISOString(),
      zitiSecured,
      error: 'Invalid agent signature (Cryptographic Verification Failure)',
    };
  }

  // 3. Resolve DPoP proof and settlement options
  let dpopProofToVerify: string | DPoPProof | undefined;
  let options: SettlementOptions = legacyOptions || {};

  if (typeof dpopProofOrOptions === 'string') {
    dpopProofToVerify = dpopProofOrOptions;
  } else if (dpopProofOrOptions && typeof dpopProofOrOptions === 'object') {
    if ('jwt' in dpopProofOrOptions || 'htm' in dpopProofOrOptions) {
      dpopProofToVerify = dpopProofOrOptions as DPoPProof;
    } else {
      options = { ...options, ...(dpopProofOrOptions as SettlementOptions) };
      dpopProofToVerify = options.dpopProof;
    }
  }

  // Fallback to payload.dpopProof if not explicitly passed
  if (!dpopProofToVerify && payload.dpopProof) {
    dpopProofToVerify = payload.dpopProof;
  }

  // 4. Verify RFC 9449 DPoP Proof at the settlement boundary (defense-in-depth)
  if (options.requireDPoP && !dpopProofToVerify) {
    return {
      success: false,
      transactionId: `tx_err_${crypto.randomBytes(8).toString('hex')}`,
      settledAmountUcents: 0,
      currency: payload.currency,
      merchantId: payload.merchantId,
      authCode: '000000',
      timestamp: new Date().toISOString(),
      zitiSecured,
      error: 'Missing RFC 9449 DPoP proof at settlement boundary (Proof-of-Possession Failure)',
    };
  }

  if (dpopProofToVerify) {
    const dpopManager = options.dpopManager || new DPoPManager();
    const expectedMethod = options.expectedMethod || 'POST';
    const expectedUrl = options.expectedUrl || 'http://localhost:3000/api/transmit-ziti';

    const dpopResult = await dpopManager.verifyProofWithDetails(
      dpopProofToVerify,
      expectedMethod,
      expectedUrl
    );

    if (!dpopResult.valid) {
      return {
        success: false,
        transactionId: `tx_err_${crypto.randomBytes(8).toString('hex')}`,
        settledAmountUcents: 0,
        currency: payload.currency,
        merchantId: payload.merchantId,
        authCode: '000000',
        timestamp: new Date().toISOString(),
        zitiSecured,
        error: `DPoP proof verification failed at settlement boundary: ${dpopResult.error || 'UNKNOWN_ERROR'}`,
      };
    }
  }

  // 5. Execute settlement lifecycle via SettlementService
  // Enforces:
  // - State machine transitions: PENDING -> AUTHORIZED -> SETTLING -> SETTLED | FAILED | COMPENSATED
  // - Idempotency keyed on payment payload nonce
  // - Daily budget quota against the single durable SpendLedger
  // - Ambiguous outcome reconciliation and compensation
  const settlementService = options.settlementService || globalSettlementService;
  const settlementResult = await settlementService.processSettlement(
    payload,
    zitiSecured,
    typeof dpopProofToVerify === 'string' ? dpopProofToVerify : dpopProofToVerify?.jwt
  );

  return settlementResult;
}

