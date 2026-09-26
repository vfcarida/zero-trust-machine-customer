import crypto from 'crypto';
import { X402Payload, X402SettlementResponse } from '../../domain/types';
import { SettlementStateMachine, TransactionState } from '../../domain/services/settlement_state_machine';
import { SpendLedger, SpendRecord, defaultSpendLedgerStore } from '../../domain/services/spend_ledger';
import { FileSpendLedgerStore } from '../../infrastructure/storage/file_spend_ledger_store';
import {
  ISettlementProvider,
  MockSettlementProvider,
} from '../../infrastructure/settlement/settlement_provider';
import { logger } from '../../infrastructure/logging/logger';

export interface SettlementServiceConfig {
  dailySpendLimitUcents?: number;
  spendLedger?: SpendLedger;
  settlementProvider?: ISettlementProvider;
}

export interface SettlementLifecycleResult extends X402SettlementResponse {
  state: TransactionState;
  idempotentReplay?: boolean;
  compensationId?: string;
}

/**
 * Application Service: Lifecycle, Idempotency, and Reconciliation Engine.
 *
 * Enforces:
 * 1. Payment nonce idempotency (replays return cached settlement results).
 * 2. In-flight race condition deduplication.
 * 3. Formal state machine transitions (PENDING -> AUTHORIZED -> SETTLING -> SETTLED | FAILED | COMPENSATED).
 * 4. Daily budget quota enforcement against the unified spend ledger.
 * 5. Deterministic reconciliation and compensation for ambiguous network outcomes.
 */
export class SettlementService {
  private spendLedger: SpendLedger;
  private provider: ISettlementProvider;
  private dailySpendLimitUcents: number;

  // In-flight mutex / promise cache for concurrent identical nonces
  private inFlightRequests: Map<string, Promise<SettlementLifecycleResult>> = new Map();

  constructor(config?: SettlementServiceConfig) {
    this.spendLedger = config?.spendLedger || new SpendLedger(defaultSpendLedgerStore);
    this.provider = config?.settlementProvider || new MockSettlementProvider();
    this.dailySpendLimitUcents = config?.dailySpendLimitUcents ?? 50000000; // Default $50.00 USD
  }

  public getSpendLedger(): SpendLedger {
    return this.spendLedger;
  }

  public getProvider(): ISettlementProvider {
    return this.provider;
  }

  /**
   * Main entry point for executing transaction settlement with lifecycle and idempotency guarantees.
   */
  public async processSettlement(
    payload: X402Payload,
    zitiSecured: boolean = true,
    dpopProof?: string
  ): Promise<SettlementLifecycleResult> {
    const nonce = payload.nonce;

    // 1. Idempotency Check: return cached result if transaction has already completed
    const existingRecord = await this.spendLedger.getTransaction(nonce);
    if (existingRecord) {
      logger.info('Idempotency check: returning cached settlement record for nonce', {
        nonce,
        state: existingRecord.state,
        transactionId: existingRecord.transactionId || existingRecord.id,
      });

      if (existingRecord.state === 'SETTLED') {
        return {
          success: true,
          transactionId: existingRecord.transactionId || existingRecord.id,
          settledAmountUcents: existingRecord.amountUcents,
          currency: existingRecord.currency,
          merchantId: existingRecord.merchantId,
          authCode: existingRecord.authCode || '000000',
          timestamp: existingRecord.timestamp,
          zitiSecured,
          state: 'SETTLED',
          idempotentReplay: true,
        };
      }

      if (existingRecord.state === 'FAILED') {
        return {
          success: false,
          transactionId: existingRecord.transactionId || existingRecord.id,
          settledAmountUcents: 0,
          currency: existingRecord.currency,
          merchantId: existingRecord.merchantId,
          authCode: '000000',
          timestamp: existingRecord.timestamp,
          zitiSecured,
          error: existingRecord.error || 'Transaction previously failed.',
          state: 'FAILED',
          idempotentReplay: true,
        };
      }

      if (existingRecord.state === 'COMPENSATED') {
        return {
          success: false,
          transactionId: existingRecord.transactionId || existingRecord.id,
          settledAmountUcents: 0,
          currency: existingRecord.currency,
          merchantId: existingRecord.merchantId,
          authCode: '000000',
          timestamp: existingRecord.timestamp,
          zitiSecured,
          error: 'Transaction was voided and compensated.',
          compensationId: existingRecord.compensationId,
          state: 'COMPENSATED',
          idempotentReplay: true,
        };
      }
    }

    // 2. Concurrency Race Condition Guard (deduplicate in-flight requests with identical nonce)
    if (this.inFlightRequests.has(nonce)) {
      logger.info('Deduplicating concurrent in-flight settlement request', { nonce });
      return await this.inFlightRequests.get(nonce)!;
    }

    // Execute settlement and cache in-flight promise
    const executionPromise = this.executeLifecycle(payload, zitiSecured, dpopProof);
    this.inFlightRequests.set(nonce, executionPromise);

    try {
      return await executionPromise;
    } finally {
      this.inFlightRequests.delete(nonce);
    }
  }

  private async executeLifecycle(
    payload: X402Payload,
    zitiSecured: boolean,
    dpopProof?: string
  ): Promise<SettlementLifecycleResult> {
    const transactionId = `tx_${crypto.randomBytes(8).toString('hex')}`;
    const sm = new SettlementStateMachine('PENDING');

    const record: SpendRecord = {
      id: transactionId,
      nonce: payload.nonce,
      amountUcents: payload.amountUcents,
      merchantId: payload.merchantId,
      currency: payload.currency,
      state: sm.getState(),
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save initial PENDING state
    await this.spendLedger.saveTransaction(record);

    // 3. Pre-flight quota and daily budget check against unified SpendLedger
    const limitCheck = await this.spendLedger.checkLimit(payload.amountUcents, this.dailySpendLimitUcents);
    if (!limitCheck.allowed) {
      sm.transitionTo('FAILED', limitCheck.reason);
      record.state = 'FAILED';
      record.error = limitCheck.reason;
      await this.spendLedger.saveTransaction(record);

      return {
        success: false,
        transactionId,
        settledAmountUcents: 0,
        currency: payload.currency,
        merchantId: payload.merchantId,
        authCode: '000000',
        timestamp: record.timestamp,
        zitiSecured,
        error: limitCheck.reason,
        state: 'FAILED',
      };
    }

    // Transition to AUTHORIZED
    sm.transitionTo('AUTHORIZED', 'Quota and signature validations passed');
    record.state = 'AUTHORIZED';
    await this.spendLedger.saveTransaction(record);

    // Transition to SETTLING (reserves budget allocation in ledger)
    sm.transitionTo('SETTLING', 'Dispatching to payment settlement provider');
    record.state = 'SETTLING';
    await this.spendLedger.saveTransaction(record);

    // 4. Dispatch to Settlement Provider
    const providerResult = await this.provider.executeSettlement({
      transactionId,
      payload,
      dpopProof,
      zitiSecured,
    });

    if (providerResult.status === 'SETTLED') {
      sm.transitionTo('SETTLED', 'Payment provider confirmed settlement');
      record.state = 'SETTLED';
      record.authCode = providerResult.authCode;
      record.transactionId = providerResult.networkTransactionId || transactionId;
      await this.spendLedger.saveTransaction(record);

      return {
        success: true,
        transactionId: record.transactionId,
        settledAmountUcents: payload.amountUcents,
        currency: payload.currency,
        merchantId: payload.merchantId,
        authCode: record.authCode || '000000',
        timestamp: new Date().toISOString(),
        zitiSecured,
        state: 'SETTLED',
      };
    }

    if (providerResult.status === 'FAILED') {
      sm.transitionTo('FAILED', providerResult.error || 'Payment rail rejected funds transfer');
      record.state = 'FAILED';
      record.error = providerResult.error;
      await this.spendLedger.saveTransaction(record); // Releases reserved budget

      return {
        success: false,
        transactionId,
        settledAmountUcents: 0,
        currency: payload.currency,
        merchantId: payload.merchantId,
        authCode: '000000',
        timestamp: new Date().toISOString(),
        zitiSecured,
        error: providerResult.error || 'Settlement failed at payment rail.',
        state: 'FAILED',
      };
    }

    // 5. Ambiguous Outcome Handling: Reconcile and Compensate
    logger.warn('Ambiguous settlement outcome detected; triggering reconciliation routine', {
      transactionId,
      nonce: payload.nonce,
      error: providerResult.error,
    });

    return await this.reconcileOrCompensate(record, sm, payload, zitiSecured);
  }

  /**
   * Deterministic reconciliation & compensation routine for ambiguous settlement outcomes.
   */
  public async reconcileOrCompensate(
    record: SpendRecord,
    sm: SettlementStateMachine,
    payload: X402Payload,
    zitiSecured: boolean
  ): Promise<SettlementLifecycleResult> {
    const reconResult = await this.provider.reconcile(record.transactionId || record.id, payload);

    if (reconResult.status === 'SETTLED') {
      sm.transitionTo('SETTLED', 'Reconciliation confirmed remote settlement');
      record.state = 'SETTLED';
      record.authCode = reconResult.authCode;
      record.transactionId = reconResult.networkTransactionId || record.transactionId || record.id;
      await this.spendLedger.saveTransaction(record);

      return {
        success: true,
        transactionId: record.transactionId,
        settledAmountUcents: payload.amountUcents,
        currency: payload.currency,
        merchantId: payload.merchantId,
        authCode: record.authCode || '000000',
        timestamp: new Date().toISOString(),
        zitiSecured,
        state: 'SETTLED',
      };
    }

    // Remote settlement did not succeed or is unconfirmed: void and compensate
    const compResult = await this.provider.compensate(
      record.transactionId || record.id,
      payload,
      'Ambiguous outcome unconfirmed during reconciliation'
    );

    sm.transitionTo('COMPENSATED', 'Reconciliation resolved to compensation');
    record.state = 'COMPENSATED';
    record.compensationId = compResult.compensationId;
    record.error = reconResult.error || 'Settlement was voided and compensated.';
    await this.spendLedger.saveTransaction(record); // Releases reserved budget

    return {
      success: false,
      transactionId: record.transactionId || record.id,
      settledAmountUcents: 0,
      currency: payload.currency,
      merchantId: payload.merchantId,
      authCode: '000000',
      timestamp: new Date().toISOString(),
      zitiSecured,
      error: 'Settlement outcome was ambiguous and has been compensated / voided.',
      compensationId: compResult.compensationId,
      state: 'COMPENSATED',
    };
  }
}

// Global default singleton settlement service backed by durable file spend ledger
export const globalSettlementService = new SettlementService({
  spendLedger: new SpendLedger(new FileSpendLedgerStore()),
});
