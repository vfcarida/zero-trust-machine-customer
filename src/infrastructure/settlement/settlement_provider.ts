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

export interface HttpSettlementProviderOptions {
  gatewayUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Production-ready HTTP Settlement Rail Provider.
 *
 * Dispatches payments to an external AP4M clearing gateway or Coinbase x402 endpoint over HTTPS/mTLS.
 * Translates timeouts, connection drops, and 5xx errors into 'AMBIGUOUS' states to trigger
 * deterministic reconciliation and compensation loops.
 */
export class HttpSettlementProvider implements ISettlementProvider {
  private gatewayUrl: string;
  private apiKey?: string;
  private timeoutMs: number;
  private fetchFn: typeof fetch;

  constructor(options: HttpSettlementProviderOptions) {
    this.gatewayUrl = options.gatewayUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  public async executeSettlement(request: SettlementRequest): Promise<SettlementProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Idempotency-Key': request.payload.nonce,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (request.dpopProof) {
      headers['DPoP'] = request.dpopProof;
    }
    if (request.zitiSecured) {
      headers['X-OpenZiti-Secured'] = 'true';
    }

    try {
      const response = await this.fetchFn(`${this.gatewayUrl}/v1/settlements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transactionId: request.transactionId,
          payload: request.payload,
          zitiSecured: request.zitiSecured,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const raw = await response.json().catch(() => null);

      if (response.ok && raw && typeof raw === 'object' && 'status' in raw && (raw as Record<string, unknown>).status === 'SETTLED') {
        return {
          status: 'SETTLED',
          authCode: (raw as Record<string, unknown>).authCode as string | undefined,
          networkTransactionId: (raw as Record<string, unknown>).networkTransactionId as string | undefined,
          rawResponse: raw,
        };
      }

      if (response.status >= 500) {
        return {
          status: 'AMBIGUOUS',
          error: `RAIL_SERVER_ERROR (${response.status}): Gateway encountered server error during settlement.`,
          rawResponse: raw,
        };
      }

      return {
        status: 'FAILED',
        error: (raw && typeof raw === 'object' && 'error' in raw && typeof (raw as Record<string, unknown>).error === 'string')
          ? ((raw as Record<string, unknown>).error as string)
          : `RAIL_PAYMENT_DECLINED (${response.status}): Gateway rejected settlement request.`,
        rawResponse: raw,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? `RAIL_GATEWAY_TIMEOUT: Settlement gateway request timed out after ${this.timeoutMs}ms.`
        : `RAIL_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`;

      logger.warn('HttpSettlementProvider network failure during settlement', {
        transactionId: request.transactionId,
        error: msg,
      });

      return {
        status: 'AMBIGUOUS',
        error: msg,
      };
    }
  }

  public async reconcile(transactionId: string, payload: X402Payload): Promise<SettlementProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await this.fetchFn(
        `${this.gatewayUrl}/v1/settlements/${encodeURIComponent(transactionId)}?nonce=${encodeURIComponent(payload.nonce)}`,
        {
          method: 'GET',
          headers,
          signal: controller.signal,
        }
      );

      clearTimeout(timer);
      const raw = await response.json().catch(() => null);

      if (response.ok && raw && typeof raw === 'object' && 'status' in raw && (raw as Record<string, unknown>).status === 'SETTLED') {
        return {
          status: 'SETTLED',
          authCode: (raw as Record<string, unknown>).authCode as string | undefined,
          networkTransactionId: (raw as Record<string, unknown>).networkTransactionId as string | undefined,
          rawResponse: raw,
        };
      }

      return {
        status: 'FAILED',
        error: 'RECONCILIATION_UNCONFIRMED: Remote clearing rail confirmed transaction was not processed.',
        rawResponse: raw,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      return {
        status: 'FAILED',
        error: `RECONCILIATION_FAILED: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public async compensate(
    transactionId: string,
    payload: X402Payload,
    reason: string
  ): Promise<CompensationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await this.fetchFn(
        `${this.gatewayUrl}/v1/settlements/${encodeURIComponent(transactionId)}/compensate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ nonce: payload.nonce, reason }),
          signal: controller.signal,
        }
      );

      clearTimeout(timer);
      const raw = await response.json().catch(() => null);

      if (response.ok) {
        return {
          compensated: true,
          compensationId: (raw && typeof raw === 'object' && 'compensationId' in raw && typeof (raw as Record<string, unknown>).compensationId === 'string')
            ? ((raw as Record<string, unknown>).compensationId as string)
            : `comp_${crypto.randomBytes(8).toString('hex')}`,
        };
      }

      return {
        compensated: false,
        compensationId: '',
        error: `COMPENSATION_REJECTED (${response.status})`,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      return {
        compensated: false,
        compensationId: '',
        error: `COMPENSATION_ERROR: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/**
 * Configurable settlement provider factory.
 * Selects HttpSettlementProvider if SETTLEMENT_RAIL_URL is configured, else defaults to MockSettlementProvider.
 */
export function createSettlementProvider(options?: {
  mode?: 'mock' | 'http';
  gatewayUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}): ISettlementProvider {
  const envMode = process.env.SETTLEMENT_RAIL_MODE === 'http' || Boolean(process.env.SETTLEMENT_RAIL_URL);
  const selectedMode = options?.mode || (envMode ? 'http' : 'mock');

  if (selectedMode === 'http') {
    const gatewayUrl = options?.gatewayUrl || process.env.SETTLEMENT_RAIL_URL || 'https://api.settlement.internal';
    return new HttpSettlementProvider({
      gatewayUrl,
      apiKey: options?.apiKey || process.env.SETTLEMENT_API_KEY,
      timeoutMs: options?.timeoutMs || 10000,
      fetchFn: options?.fetchFn,
    });
  }

  return new MockSettlementProvider();
}

