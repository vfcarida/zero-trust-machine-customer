import { X402Payload, GuardSettings, TaintStatus } from '../../domain/types';
import { logger } from '../logging/logger';

export interface OPAInputContext {
  action: string;
  transaction: X402Payload;
  currentDailySpendUcents: number;
  guardSettings: GuardSettings;
  taintStatus: TaintStatus;
  actorSpiffeId?: string;
}

export interface OPADecisionResult {
  allow: boolean;
  reasons: string[];
  evaluatedAt: string;
}

/**
 * Open Policy Agent (OPA) Client Interface for Policy-as-Code Dynamic Authorization.
 * Evaluates contextual data against Rego policy engine rules for every tool invocation.
 */
export class OPAClient {
  private serverUrl: string;

  constructor(serverUrl = 'http://localhost:8181/v1/data/machine_customer/authz') {
    this.serverUrl = serverUrl;
  }

  /**
   * Evaluates an authorization decision dynamically via OPA Rego policy server with fallback evaluation logic.
   */
  public async evaluateAuthorization(context: OPAInputContext): Promise<OPADecisionResult> {
    logger.info('Evaluating Policy-as-Code Authorization via OPA', {
      action: context.action,
      merchantId: context.transaction.merchantId,
      amountUcents: context.transaction.amountUcents,
      taintStatus: context.taintStatus,
    });

    try {
      if (typeof fetch !== 'undefined') {
        const response = await fetch(this.serverUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: context }),
        });

        if (response.ok) {
          const data = (await response.json()) as { result?: { allow?: boolean; deny_reason?: string[] } };
          if (data.result) {
            return {
              allow: Boolean(data.result.allow),
              reasons: data.result.deny_reason || [],
              evaluatedAt: new Date().toISOString(),
            };
          }
        }
      }
    } catch (err: any) {
      logger.warn('OPA Server unreachable, utilizing embedded Rego policy engine fallback', {
        error: err.message || err,
      });
    }

    // Embedded Policy Fallback enforcing Rego semantics
    return this.evaluateEmbeddedRego(context);
  }

  private evaluateEmbeddedRego(context: OPAInputContext): OPADecisionResult {
    const reasons: string[] = [];

    // Check merchant allowlist
    const normalizedMerchant = (context.transaction.merchantId || '').toLowerCase().trim();
    const isAllowed = context.guardSettings.allowlist.some(
      (m) => m.toLowerCase().trim() === normalizedMerchant
    );
    if (!isAllowed) {
      reasons.push('UNAUTHORIZED_MERCHANT');
    }

    // Check daily spend limit
    const projectedSpend = context.currentDailySpendUcents + context.transaction.amountUcents;
    if (projectedSpend > context.guardSettings.dailySpendLimitUcents) {
      reasons.push('DAILY_LIMIT_EXCEEDED');
    }

    // Check taint status
    if (context.taintStatus === 'TAINTED') {
      reasons.push('TAINTED_PAYLOAD_HITL_REQUIRED');
    }

    const allow = reasons.length === 0;

    return {
      allow,
      reasons,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
