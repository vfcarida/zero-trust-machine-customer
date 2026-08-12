import { X402Payload, GuardSettings, TrustedMetadataEnvelope } from '../../domain/types';
import { AgentKernelQuotaExceededError, SecurityPolicyViolationError } from '../../domain/errors/domain_errors';
import { OPAClient, OPADecisionResult } from '../../infrastructure/authorization/opa_client';
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
 */
export class AgentKernel {
  private opaClient: OPAClient;
  private guardSettings: GuardSettings;
  private currentDailySpendUcents = 0;
  private actionTimestamps: number[] = [];

  constructor(guardSettings: GuardSettings, opaClient?: OPAClient) {
    this.guardSettings = guardSettings;
    this.opaClient = opaClient || new OPAClient();
  }

  public getDailySpend(): number {
    return this.currentDailySpendUcents;
  }

  public setDailySpend(spend: number): void {
    this.currentDailySpendUcents = Math.max(0, spend);
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

    // 1. Enforce Rate Limiting Quota
    const now = Date.now();
    this.actionTimestamps = this.actionTimestamps.filter((ts) => now - ts < 60000);
    if (this.actionTimestamps.length >= this.guardSettings.maxRatePerMinute) {
      throw new AgentKernelQuotaExceededError(
        `Rate limit exceeded: Maximum ${this.guardSettings.maxRatePerMinute} actions per minute allowed.`
      );
    }
    this.actionTimestamps.push(now);

    // 2. Evaluate Dynamic OPA Policy-as-Code
    const opaDecision = await this.opaClient.evaluateAuthorization({
      action: request.action,
      transaction: request.payload,
      currentDailySpendUcents: this.currentDailySpendUcents,
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

    // 3. Commit spend to state upon validation
    this.currentDailySpendUcents += request.payload.amountUcents;

    return {
      allowed: true,
      opaDecision,
      hitlRequired: false,
      executionTimestamp: new Date().toISOString(),
    };
  }
}
