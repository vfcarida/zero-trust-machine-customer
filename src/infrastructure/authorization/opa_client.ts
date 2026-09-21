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

export type DecisionProvenance = 'opa' | 'embedded-dev';

export interface OPADecisionResult {
  allow: boolean;
  reasons: string[];
  evaluatedAt: string;
  provenance: DecisionProvenance;
}

export interface OPAClientOptions {
  serverUrl?: string;
  enforceStrict?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export type OPAClientConfig = string | OPAClientOptions;

/**
 * Open Policy Agent (OPA) Client Interface for Policy-as-Code Dynamic Authorization.
 * Evaluates contextual data against Rego policy engine rules for every tool invocation.
 * Fails closed in strict mode when the OPA sidecar is unreachable.
 */
export class OPAClient {
  private serverUrl: string;
  private enforceStrict: boolean;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(config?: OPAClientConfig) {
    if (typeof config === 'string') {
      this.serverUrl = config;
      this.enforceStrict = this.resolveDefaultStrictMode();
      this.timeoutMs = 2000;
      this.maxRetries = 1;
    } else {
      this.serverUrl =
        config?.serverUrl ||
        (typeof process !== 'undefined' && process.env.OPA_SERVER_URL) ||
        'http://localhost:8181/v1/data/machine_customer/authz';
      this.enforceStrict =
        config?.enforceStrict !== undefined
          ? config.enforceStrict
          : this.resolveDefaultStrictMode();
      this.timeoutMs = config?.timeoutMs ?? 2000;
      this.maxRetries = config?.maxRetries ?? 1;
    }
  }

  private resolveDefaultStrictMode(): boolean {
    if (typeof process !== 'undefined' && process.env.OPA_ENFORCE_STRICT !== undefined) {
      return process.env.OPA_ENFORCE_STRICT === 'true';
    }
    // Default to strict (fail-closed) in production / non-dev environments
    return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  }

  public getEnforceStrict(): boolean {
    return this.enforceStrict;
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * Internal HTTP POST fetch with AbortController timeout and bounded retries.
   */
  private async fetchWithTimeoutAndRetry(
    url: string,
    body: string,
    timeoutMs: number,
    maxRetries: number
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);
        return response;
      } catch (err: unknown) {
        clearTimeout(timer);
        lastError = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }
    throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
  }

  /**
   * Evaluates an authorization decision dynamically via OPA Rego policy server.
   * Fail-closed: if OPA is unreachable in strict mode, returns an immediate deny.
   */
  public async evaluateAuthorization(context: OPAInputContext): Promise<OPADecisionResult> {
    logger.info('Evaluating Policy-as-Code Authorization via OPA', {
      action: context.action,
      merchantId: context.transaction.merchantId,
      amountUcents: context.transaction.amountUcents,
      taintStatus: context.taintStatus,
      strictMode: this.enforceStrict,
    });

    try {
      if (typeof fetch !== 'undefined') {
        const response = await this.fetchWithTimeoutAndRetry(
          this.serverUrl,
          JSON.stringify({ input: context }),
          this.timeoutMs,
          this.maxRetries
        );

        if (response.ok) {
          const data = (await response.json()) as {
            result?: { allow?: boolean; deny_reason?: string[] };
          };
          if (data.result) {
            const allow = Boolean(data.result.allow);
            const reasons = data.result.deny_reason || [];
            const result: OPADecisionResult = {
              allow,
              reasons,
              evaluatedAt: new Date().toISOString(),
              provenance: 'opa',
            };

            logger.info('OPA Policy Evaluation Succeeded', {
              action: context.action,
              allow: result.allow,
              reasons: result.reasons,
              provenance: result.provenance,
            });

            return result;
          }
        } else {
          logger.warn('OPA Server returned non-200 status', {
            status: response.status,
            statusText: response.statusText,
          });
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn('OPA Server unreachable or request timed out', {
        error: errMsg,
        serverUrl: this.serverUrl,
        strictMode: this.enforceStrict,
      });
    }

    // Fail-closed enforcement in strict mode
    if (this.enforceStrict) {
      const failClosedDecision: OPADecisionResult = {
        allow: false,
        reasons: ['OPA_SERVER_UNREACHABLE_FAIL_CLOSED'],
        evaluatedAt: new Date().toISOString(),
        provenance: 'opa',
      };

      logger.error('OPA Policy Enforcement Failed Closed (Strict Mode)', {
        action: context.action,
        reasons: failClosedDecision.reasons,
        provenance: failClosedDecision.provenance,
      });

      return failClosedDecision;
    }

    // Non-strict dev mode: fallback to embedded evaluator tagged with 'embedded-dev'
    const embeddedDecision = this.evaluateEmbeddedRego(context);
    logger.info('OPA Policy Fallback to Embedded Evaluator (Dev Mode)', {
      action: context.action,
      allow: embeddedDecision.allow,
      reasons: embeddedDecision.reasons,
      provenance: embeddedDecision.provenance,
    });

    return embeddedDecision;
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
      provenance: 'embedded-dev',
    };
  }
}
