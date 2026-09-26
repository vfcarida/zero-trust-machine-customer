import crypto from 'crypto';
import { X402Payload, X402SettlementResponse, DPoPProof } from '../domain/types';
import { validateX402PayloadStructure, verifyX402Payload } from './agent_pay_protocol';
import { DPoPManager } from '../infrastructure/auth/dpop';
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
 * Server-side settlement processor for vendor / acquirer nodes.
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
  const settlementService = options.settlementService || globalSettlementService;
  const settlementResult = await settlementService.processSettlement(
    payload,
    zitiSecured,
    typeof dpopProofToVerify === 'string' ? dpopProofToVerify : dpopProofToVerify?.jwt
  );

  return settlementResult;
}
