import { X402Payload, GuardSettings, TrustedMetadataEnvelope } from '../../domain/types';
import { AgentKernelQuotaExceededError, SecurityPolicyViolationError } from '../../domain/errors/domain_errors';
import { OPAClient, OPADecisionResult } from '../../infrastructure/authorization/opa_client';
import { SpendLedger, InMemorySpendLedgerStore } from '../../domain/services/spend_ledger';
import { logger } from '../../infrastructure/logging/logger';

export interface KernelExecutionRequest {
  action: string;
  payload: X402Payload;
  envelope: TrustedMetadataEnvelope;
  actorSpiffeId?: string;
}

export interface KernelExecutionResult {
  allowed: boolean;
  opaDecision: OPADecisionResult;
  hitlRequired: boolean;
  executionTimestamp: string;
}

/**
 * AgentKernel: Structural Enforcement Layer & Execution Sandbox (OWASP Agentic Safety).
 * Intercepts requested actions, validates against cryptographic allowlists, and enforces strict rate & budget quotas.
 * Replaces disconnected in-memory counter with the unified SpendLedger.
 */
export class AgentKernel {
  private opaClient: OPAClient;
  private guardSettings: GuardSettings;
  private spendLedger: SpendLedger;
  private actionTimestamps: number[] = [];

  constructor(guardSettings: GuardSettings, opaClient?: OPAClient, spendLedger?: SpendLedger) {
    this.guardSettings = guardSettings;
    this.opaClient = opaClient || new OPAClient();
    this.spendLedger = spendLedger || new SpendLedger(new InMemorySpendLedgerStore());
  }

  public getSpendLedger(): SpendLedger {
    return this.spendLedger;
  }

  public getDailySpend(): number {
    return this.spendLedger.getDailySpendUcentsSync();
  }

  public async getDailySpendAsync(): Promise<number> {
    return await this.spendLedger.getDailySpendUcents();
  }

  public setDailySpend(spend: number): void {
    this.spendLedger.clear();
    if (spend > 0) {
      this.spendLedger.saveTransaction({
        id: `tx_kernel_init_${Date.now()}`,
        nonce: `init_nonce_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        amountUcents: Math.max(0, spend),
        merchantId: 'system',
        currency: 'USD',
        state: 'SETTLED',
        timestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Intercepts an action request, enforcing rate limits, budget quotas, taint status, and OPA policies.
   */
  public async interceptAndValidate(request: KernelExecutionRequest): Promise<KernelExecutionResult> {
    logger.info('AgentKernel intercepting action request', {
      action: request.action,
      merchantId: request.payload.merchantId,
      amountUcents: request.payload.amountUcents,
      taintStatus: request.envelope.taintStatus,
    });

    // 1. Enforce Rate Limiting Quota using a 60-second sliding window
    const now = Date.now();
    const windowStart = now - 60000;
    this.actionTimestamps = this.actionTimestamps.filter((ts) => ts > windowStart);

    const maxRate = this.guardSettings.maxRatePerMinute ?? 60;
    if (this.actionTimestamps.length >= maxRate) {
      throw new AgentKernelQuotaExceededError(
        `Rate limit exceeded: Maximum ${maxRate} actions per minute allowed.`
      );
    }
    this.actionTimestamps.push(now);

    // 2. Evaluate Dynamic OPA Policy-as-Code against current daily spend from SpendLedger
    const currentDailySpend = await this.spendLedger.getDailySpendUcents();
    const opaDecision = await this.opaClient.evaluateAuthorization({
      action: request.action,
      transaction: request.payload,
      currentDailySpendUcents: currentDailySpend,
      guardSettings: this.guardSettings,
      taintStatus: request.envelope.taintStatus,
      actorSpiffeId: request.actorSpiffeId,
    });

    if (!opaDecision.allow) {
      logger.warn('AgentKernel blocked action execution via Policy-as-Code', {
        reasons: opaDecision.reasons,
      });

      if (opaDecision.reasons.includes('TAINTED_PAYLOAD_HITL_REQUIRED')) {
        return {
          allowed: false,
          opaDecision,
          hitlRequired: true,
          executionTimestamp: new Date().toISOString(),
        };
      }

      throw new SecurityPolicyViolationError(
        `AgentKernel execution denied by OPA policy. Reasons: ${opaDecision.reasons.join(', ')}`
      );
    }

    // 3. Commit spend to SpendLedger upon validation
    await this.spendLedger.saveTransaction({
      id: `tx_kernel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nonce: request.payload.nonce || `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      amountUcents: request.payload.amountUcents,
      merchantId: request.payload.merchantId,
      currency: request.payload.currency,
      state: 'SETTLED',
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      allowed: true,
      opaDecision,
      hitlRequired: false,
      executionTimestamp: new Date().toISOString(),
    };
  }
}
