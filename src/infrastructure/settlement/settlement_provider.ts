import crypto from 'crypto';
import { X402Payload } from '../../domain/types';
import { logger } from '../logging/logger';

export interface SettlementRequest {
  transactionId: string;
  payload: X402Payload;
  dpopProof?: string;
  zitiSecured: boolean;
}

export type SettlementStatus = 'SETTLED' | 'FAILED' | 'AMBIGUOUS';

export interface SettlementProviderResult {
  status: SettlementStatus;
  authCode?: string;
  networkTransactionId?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface CompensationResult {
  compensated: boolean;
  compensationId: string;
  error?: string;
}

/**
 * Clean Settlement Provider Contract (Payment Rail Boundary).
 *
 * This abstraction isolates the business lifecycle and state machine from the underlying
 * payment rail, allowing interchangeable adapters (e.g. Mastercard Agent Pay, Coinbase x402,
 * Stripe, or a local high-fidelity simulator).
 */
export interface ISettlementProvider {
  executeSettlement(request: SettlementRequest): Promise<SettlementProviderResult>;
  reconcile(transactionId: string, payload: X402Payload): Promise<SettlementProviderResult>;
  compensate(transactionId: string, payload: X402Payload, reason: string): Promise<CompensationResult>;
}

/**
 * Mock settlement provider for local development, simulation, and adversarial testing.
 * Supports programmable ambiguous outcomes, timeouts, failures, and compensations.
 */
export class MockSettlementProvider implements ISettlementProvider {
  public executionCount = 0;
  public reconcileCount = 0;
  public compensateCount = 0;

  private nextBehavior?: 'SETTLED' | 'FAILED' | 'AMBIGUOUS';
  private reconcileResolution?: 'SETTLED' | 'FAILED';
  private simulatedLatencyMs = 0;

  constructor(options?: { simulatedLatencyMs?: number }) {
    if (options?.simulatedLatencyMs) {
      this.simulatedLatencyMs = options.simulatedLatencyMs;
    }
  }

  public setNextBehavior(behavior: 'SETTLED' | 'FAILED' | 'AMBIGUOUS'): void {
    this.nextBehavior = behavior;
  }

  public setReconcileResolution(resolution: 'SETTLED' | 'FAILED'): void {
    this.reconcileResolution = resolution;
  }

  public async executeSettlement(request: SettlementRequest): Promise<SettlementProviderResult> {
    this.executionCount++;

    if (this.simulatedLatencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedLatencyMs));
    }

    const behavior = this.nextBehavior || 'SETTLED';
    this.nextBehavior = undefined; // Single-use override

    logger.info('MockSettlementProvider executing payment settlement', {
      transactionId: request.transactionId,
      merchantId: request.payload.merchantId,
      amountUcents: request.payload.amountUcents,
      behavior,
    });

    if (behavior === 'FAILED') {
      return {
        status: 'FAILED',
        error: 'RAIL_PAYMENT_DECLINED: Acquirer rejected settlement funds transfer.',
      };
    }

    if (behavior === 'AMBIGUOUS') {
      return {
        status: 'AMBIGUOUS',
        error: 'RAIL_GATEWAY_TIMEOUT: Downstream network timeout. Settlement state unknown.',
      };
    }

    // Default SETTLED
    return {
      status: 'SETTLED',
      authCode: Math.floor(100000 + Math.random() * 900000).toString(),
      networkTransactionId: `tx_rail_${crypto.randomBytes(8).toString('hex')}`,
    };
  }

  public async reconcile(transactionId: string, payload: X402Payload): Promise<SettlementProviderResult> {
    this.reconcileCount++;

    const resolution = this.reconcileResolution || 'FAILED';

    logger.info('MockSettlementProvider reconciling ambiguous transaction', {
      transactionId,
      nonce: payload.nonce,
      resolution,
    });

    if (resolution === 'SETTLED') {
      return {
        status: 'SETTLED',
        authCode: Math.floor(100000 + Math.random() * 900000).toString(),
        networkTransactionId: `tx_reconciled_${crypto.randomBytes(8).toString('hex')}`,
      };
    }

    return {
      status: 'FAILED',
      error: 'RECONCILIATION_UNCONFIRMED: Remote rail confirmed transaction was not processed.',
    };
  }

  public async compensate(
    transactionId: string,
    payload: X402Payload,
    reason: string
  ): Promise<CompensationResult> {
    this.compensateCount++;

    const compensationId = `comp_${crypto.randomBytes(8).toString('hex')}`;
    logger.info('MockSettlementProvider executed compensation / void reversal', {
      transactionId,
      nonce: payload.nonce,
      compensationId,
      reason,
    });

    return {
      compensated: true,
      compensationId,
    };
  }
}
