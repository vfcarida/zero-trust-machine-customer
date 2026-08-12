import { X402Payload, GuardSettings } from '../types';
import { SecurityPolicyViolationError } from '../errors/domain_errors';

export interface ReasoningResult {
  reasoningSteps: string[];
  proposedPayload: Omit<X402Payload, 'signature'>;
  confidenceScore: number;
}

/**
 * Domain Service: Encapsulates agent reasoning logic, prompt lifecycle,
 * and deterministic evaluation of telemetry input into machine purchase intents.
 */
export class AgentReasoningService {
  /**
   * Generates a purchase transaction payload based on telemetry levels and agent reasoning chain thoughts (<|think|>).
   */
  public generatePurchaseIntent(
    telemetry: { resourceType: 'compute' | 'coolant'; currentLevel: number; threshold: number },
    agentId: string,
    settings: GuardSettings
  ): ReasoningResult {
    if (telemetry.currentLevel >= telemetry.threshold) {
      throw new SecurityPolicyViolationError(
        `Telemetry level (${telemetry.currentLevel}%) is above critical threshold (${telemetry.threshold}%). Procurement not triggered.`
      );
    }

    const isCompute = telemetry.resourceType === 'compute';
    const merchantId = isCompute ? 'aws_compute' : 'partssource_corp';
    const intent = isCompute
      ? 'Procure 500 Compute Node Hours (High Performance Batch)'
      : 'Procure 100L Synthetic Coolant Fluid (Thermal Management)';

    // Compute required ucents (Micro-cents)
    const baseAmountUcents = isCompute ? 15000000 : 8500000; // $15.00 or $8.50

    const reasoningSteps = [
      `[THINK] Telemetry metric "${telemetry.resourceType}" dropped to ${telemetry.currentLevel}% (below threshold ${telemetry.threshold}%).`,
      `[THINK] Evaluating vendor selection against active policy allowlist...`,
      `[THINK] Target merchant "${merchantId}" resolved. Allowed: ${settings.allowlist.includes(merchantId)}.`,
      `[THINK] Calculating optimal replenishment batch size and cost equivalent: ${baseAmountUcents} ucents.`,
      `[THINK] Constructing deterministic x402 payment specification payload.`,
    ];

    const proposedPayload: Omit<X402Payload, 'signature'> = {
      x402Version: '1.0.0',
      agentId,
      merchantId,
      intent,
      amountUcents: baseAmountUcents,
      currency: 'USD',
      timestamp: new Date().toISOString(),
      nonce: `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    return {
      reasoningSteps,
      proposedPayload,
      confidenceScore: 0.98,
    };
  }
}
