import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { SettlementService } from '../../application/services/settlement_service';
import { SettlementStateMachine } from '../../domain/services/settlement_state_machine';
import {
  SpendLedger,
  InMemorySpendLedgerStore,
  FileSpendLedgerStore,
} from '../../domain/services/spend_ledger';
import { MockSettlementProvider } from '../../infrastructure/settlement/settlement_provider';
import { IllegalStateTransitionError } from '../../domain/errors/domain_errors';
import { AgentKernel } from '../../application/kernel/agent_kernel';
import { X402Payload, GuardSettings, TrustedMetadataEnvelope } from '../../domain/types';

describe('Integration: Transaction State Machine, Idempotency & Reconciliation (Suite E4)', () => {
  let samplePayload: X402Payload;

  beforeEach(() => {
    samplePayload = {
      x402Version: '1.0.0',
      agentId: 'did:key:z6MkqB3zV18xPzT9m74H6eF8w4xY7tQ8rL2eD6jP3tS1vW',
      merchantId: 'aws_compute',
      intent: 'Procure 32 Cloud Compute Cores',
      amountUcents: 8000000, // $8.00 USD
      currency: 'USD',
      timestamp: new Date().toISOString(),
      nonce: `nonce_${crypto.randomBytes(8).toString('hex')}`,
      signature: 'valid_mock_signature',
    };
  });

  describe('E4.1: Idempotency Keyed on Payment Nonce', () => {
    it('should return original settlement result on repeat nonce without second rail settlement', async () => {
      const store = new InMemorySpendLedgerStore();
      const ledger = new SpendLedger(store);
      const provider = new MockSettlementProvider();
      const service = new SettlementService({
        spendLedger: ledger,
        settlementProvider: provider,
        dailySpendLimitUcents: 50000000, // $50.00 USD
      });

      // First settlement execution
      const result1 = await service.processSettlement(samplePayload, true);
      expect(result1.success).toBe(true);
      expect(result1.state).toBe('SETTLED');
      expect(result1.idempotentReplay).toBeFalsy();
      expect(result1.authCode).toBeDefined();
      expect(provider.executionCount).toBe(1);

      const spendAfterFirst = await ledger.getDailySpendUcents();
      expect(spendAfterFirst).toBe(8000000);

      // Duplicate submission with identical nonce
      const result2 = await service.processSettlement(samplePayload, true);
      expect(result2.success).toBe(true);
      expect(result2.state).toBe('SETTLED');
      expect(result2.idempotentReplay).toBe(true);
      expect(result2.transactionId).toBe(result1.transactionId);
      expect(result2.authCode).toBe(result1.authCode);

      // Payment rail MUST NOT be invoked a second time
      expect(provider.executionCount).toBe(1);

      // Spend must NOT be double-counted
      const spendAfterSecond = await ledger.getDailySpendUcents();
      expect(spendAfterSecond).toBe(8000000);
    });
  });

  describe('E4.2: Concurrency Race Condition Guard', () => {
    it('should deduplicate concurrent in-flight requests with identical nonce to exactly one rail execution', async () => {
      const store = new InMemorySpendLedgerStore();
      const ledger = new SpendLedger(store);
      // Add simulated latency to provider so requests overlap in-flight
      const provider = new MockSettlementProvider({ simulatedLatencyMs: 30 });
      const service = new SettlementService({
        spendLedger: ledger,
        settlementProvider: provider,
        dailySpendLimitUcents: 50000000,
      });

      // Dispatch 10 concurrent requests simultaneously with identical nonce
      const concurrentCalls = Array.from({ length: 10 }, () =>
        service.processSettlement(samplePayload, true)
      );

      const results = await Promise.all(concurrentCalls);

      // All 10 callers receive successful responses with identical transactionId & authCode
      expect(results).toHaveLength(10);
      const firstTxId = results[0].transactionId;
      const firstAuthCode = results[0].authCode;

      for (const res of results) {
        expect(res.success).toBe(true);
        expect(res.transactionId).toBe(firstTxId);
        expect(res.authCode).toBe(firstAuthCode);
        expect(res.state).toBe('SETTLED');
      }

      // Rail must be executed exactly ONCE
      expect(provider.executionCount).toBe(1);

      // Spend counted exactly once
      const finalSpend = await ledger.getDailySpendUcents();
      expect(finalSpend).toBe(8000000);
    });
  });

  describe('E4.3: State Machine Transition Invariants', () => {
    it('should enforce legal lifecycle transitions and maintain full audit history', () => {
      const sm = new SettlementStateMachine('PENDING');
      expect(sm.getState()).toBe('PENDING');

      // Valid: PENDING -> AUTHORIZED
      sm.transitionTo('AUTHORIZED', 'Signature and quota validated');
      expect(sm.getState()).toBe('AUTHORIZED');

      // Valid: AUTHORIZED -> SETTLING
      sm.transitionTo('SETTLING', 'Dispatched to acquirer network');
      expect(sm.getState()).toBe('SETTLING');

      // Valid: SETTLING -> SETTLED
      sm.transitionTo('SETTLED', 'Payment network confirmed funds capture');
      expect(sm.getState()).toBe('SETTLED');
      expect(sm.isTerminal()).toBe(true);

      // Audit history records initial creation + 3 transitions
      const history = sm.getHistory();
      expect(history).toHaveLength(4);
      expect(history[0].from).toBe('PENDING');
      expect(history[0].to).toBe('PENDING');
      expect(history[0].reason).toBe('Initial state creation');
      expect(history[1].from).toBe('PENDING');
      expect(history[1].to).toBe('AUTHORIZED');
      expect(history[2].from).toBe('AUTHORIZED');
      expect(history[2].to).toBe('SETTLING');
      expect(history[3].from).toBe('SETTLING');
      expect(history[3].to).toBe('SETTLED');
    });

    it('should reject illegal transitions with IllegalStateTransitionError', () => {
      // Direct jump: PENDING -> SETTLED without AUTHORIZED/SETTLING
      const sm1 = new SettlementStateMachine('PENDING');
      expect(() => sm1.transitionTo('SETTLED')).toThrow(IllegalStateTransitionError);

      // Terminal state cannot transition: SETTLED -> SETTLING
      const sm2 = new SettlementStateMachine('SETTLED');
      expect(() => sm2.transitionTo('SETTLING')).toThrow(IllegalStateTransitionError);

      // Terminal state cannot transition: FAILED -> SETTLED
      const sm3 = new SettlementStateMachine('FAILED');
      expect(() => sm3.transitionTo('SETTLED')).toThrow(IllegalStateTransitionError);

      // Terminal state cannot transition: COMPENSATED -> SETTLED
      const sm4 = new SettlementStateMachine('COMPENSATED');
      expect(() => sm4.transitionTo('SETTLED')).toThrow(IllegalStateTransitionError);
    });
  });

  describe('E4.4: Ambiguous Outcome Handling & Compensation (Void / Refund)', () => {
    it('should reconcile ambiguous outcome to COMPENSATED and release reserved budget quota', async () => {
      const store = new InMemorySpendLedgerStore();
      const ledger = new SpendLedger(store);
      const provider = new MockSettlementProvider();

      // Configure mock provider to timeout/return AMBIGUOUS on settlement,
      // and fail resolution during reconciliation (unconfirmed remote execution)
      provider.setNextBehavior('AMBIGUOUS');
      provider.setReconcileResolution('FAILED');

      const service = new SettlementService({
        spendLedger: ledger,
        settlementProvider: provider,
        dailySpendLimitUcents: 50000000,
      });

      const result = await service.processSettlement(samplePayload, true);

      // Reconciler should resolve to COMPENSATED
      expect(result.success).toBe(false);
      expect(result.state).toBe('COMPENSATED');
      expect(result.compensationId).toBeDefined();
      expect(result.compensationId).toContain('comp_');
      expect(provider.reconcileCount).toBe(1);
      expect(provider.compensateCount).toBe(1);

      // Reserved budget in SpendLedger MUST be released (daily spend remains 0)
      const dailySpend = await ledger.getDailySpendUcents();
      expect(dailySpend).toBe(0);

      // Replay of ambiguous transaction returns cached COMPENSATED state without re-running rail
      const replay = await service.processSettlement(samplePayload, true);
      expect(replay.state).toBe('COMPENSATED');
      expect(replay.idempotentReplay).toBe(true);
      expect(replay.compensationId).toBe(result.compensationId);
      expect(provider.executionCount).toBe(1);
    });
  });

  describe('E4.5: Ambiguous Outcome Reconciling to SETTLED', () => {
    it('should reconcile ambiguous outcome to SETTLED when remote rail confirms success', async () => {
      const store = new InMemorySpendLedgerStore();
      const ledger = new SpendLedger(store);
      const provider = new MockSettlementProvider();

      // Downstream gateway timed out, but remote rail actually processed the transaction
      provider.setNextBehavior('AMBIGUOUS');
      provider.setReconcileResolution('SETTLED');

      const service = new SettlementService({
        spendLedger: ledger,
        settlementProvider: provider,
        dailySpendLimitUcents: 50000000,
      });

      const result = await service.processSettlement(samplePayload, true);

      expect(result.success).toBe(true);
      expect(result.state).toBe('SETTLED');
      expect(result.authCode).toBeDefined();
      expect(provider.reconcileCount).toBe(1);
      expect(provider.compensateCount).toBe(0);

      // Confirmed spend is retained in ledger
      const dailySpend = await ledger.getDailySpendUcents();
      expect(dailySpend).toBe(8000000);
    });
  });

  describe('E4.6: Durable Ledger Survival Across Process Restarts', () => {
    let tempDir: string;
    let tempFilePath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztmc-ledger-test-'));
      tempFilePath = path.join(tempDir, 'spend_ledger.json');
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it('should persist transactions to disk and enforce daily budget across simulated process restarts', async () => {
      // Phase 1: First Process Lifetime
      const fileStore1 = new FileSpendLedgerStore(tempFilePath);
      const ledger1 = new SpendLedger(fileStore1);
      const service1 = new SettlementService({
        spendLedger: ledger1,
        dailySpendLimitUcents: 50000000, // $50.00 limit
      });

      // Settle $30.00 transaction
      const payload1: X402Payload = {
        ...samplePayload,
        amountUcents: 30000000, // $30.00
        nonce: `nonce_proc1_${Date.now()}`,
      };

      const result1 = await service1.processSettlement(payload1, true);
      expect(result1.success).toBe(true);
      expect(result1.state).toBe('SETTLED');

      // Verify file exists on disk with persisted data
      expect(fs.existsSync(tempFilePath)).toBe(true);
      const fileContent = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
      expect(fileContent).toHaveLength(1);
      expect(fileContent[0].amountUcents).toBe(30000000);

      // Phase 2: Process "Restarts" (New Store instance reloads from the same disk file)
      const fileStore2 = new FileSpendLedgerStore(tempFilePath);
      const ledger2 = new SpendLedger(fileStore2);
      const service2 = new SettlementService({
        spendLedger: ledger2,
        dailySpendLimitUcents: 50000000, // $50.00 limit
      });

      // Reloaded ledger correctly reports existing $30.00 spend
      const restoredSpend = await ledger2.getDailySpendUcents();
      expect(restoredSpend).toBe(30000000);

      // Attempt second transaction for $25.00 ($30.00 + $25.00 = $55.00 > $50.00 limit)
      const payload2: X402Payload = {
        ...samplePayload,
        amountUcents: 25000000, // $25.00
        nonce: `nonce_proc2_${Date.now()}`,
      };

      const result2 = await service2.processSettlement(payload2, true);
      expect(result2.success).toBe(false);
      expect(result2.state).toBe('FAILED');
      expect(result2.error).toContain('Daily spending limit exceeded');

      // Daily spend remains at $30.00 (failed transaction not charged)
      const finalSpend = await ledger2.getDailySpendUcents();
      expect(finalSpend).toBe(30000000);
    });
  });

  describe('E4.7: Unified Spend Counter Synchronization (AgentKernel & SettlementService)', () => {
    it('should share single source of truth between AgentKernel and SettlementService', async () => {
      const sharedStore = new InMemorySpendLedgerStore();
      const sharedLedger = new SpendLedger(sharedStore);

      const guardSettings: GuardSettings = {
        enabled: true,
        dailySpendLimitUcents: 20000000, // $20.00 limit
        allowlist: ['aws_compute'],
        maxRatePerMinute: 60,
      };

      const kernel = new AgentKernel(guardSettings, undefined, sharedLedger);
      const settlementService = new SettlementService({
        spendLedger: sharedLedger,
        dailySpendLimitUcents: 20000000,
      });

      // Initial spend across both is zero
      expect(kernel.getDailySpend()).toBe(0);
      expect(await sharedLedger.getDailySpendUcents()).toBe(0);

      // Settle $12.00 through SettlementService
      const payload1: X402Payload = {
        ...samplePayload,
        amountUcents: 12000000,
        nonce: `sync_nonce_1_${Date.now()}`,
      };

      const settleResult = await settlementService.processSettlement(payload1, true);
      expect(settleResult.success).toBe(true);

      // AgentKernel immediately sees the updated spend via unified ledger
      expect(kernel.getDailySpend()).toBe(12000000);
      expect(await kernel.getDailySpendAsync()).toBe(12000000);

      // Now attempt $10.00 action in AgentKernel ($12.00 + $10.00 = $22.00 > $20.00 ceiling)
      const expensiveEnvelope: TrustedMetadataEnvelope = {
        payloadId: 'env_sync_01',
        source: 'telemetry',
        content: JSON.stringify(samplePayload),
        taintStatus: 'UNTAINTED',
        timestamp: new Date().toISOString(),
        requiresHITL: false,
      };

      const expensivePayload: X402Payload = {
        ...samplePayload,
        amountUcents: 10000000, // $10.00
        nonce: `sync_nonce_2_${Date.now()}`,
      };

      // AgentKernel rejects because unified spend ledger already recorded $12.00
      await expect(
        kernel.interceptAndValidate({
          action: 'execute_transaction',
          payload: expensivePayload,
          envelope: expensiveEnvelope,
        })
      ).rejects.toThrow();
    });
  });
});
