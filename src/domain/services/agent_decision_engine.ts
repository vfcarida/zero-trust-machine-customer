import { X402Payload, TrustedMetadataEnvelope } from '../types';
import { TaintEnvelopeTracker, ThreatAnalysisResult } from '../entities/taint_envelope';

export interface ResourceTelemetryContext {
  resourceType: 'compute' | 'coolant';
  name: string;
  currentLevel: number;
  criticalThreshold: number;
  capacity: string;
  costPerUnitUcents: number;
  replenishQuantity: number;
  merchantId: string;
  unitName: string;
  triggerReason: string;
  externalMerchantQuote?: string;
}

export type DecisionStepType =
  | 'SPAWN_MODEL'
  | 'INGEST_TELEMETRY'
  | 'INJECT_SYSTEM_PROMPT'
  | 'REASONING_CHAIN'
  | 'FINANCIAL_CALCULATION'
  | 'PAYLOAD_SYNTHESIS'
  | 'TAINT_WRAPPING';

export interface AgentDecisionStep {
  type: DecisionStepType;
  message: string;
}

export interface AgentProcurementDecision {
  shouldProcure: boolean;
  intent: string;
  amountUcents: number;
  rawPayload: Omit<X402Payload, 'signature'>;
  envelope: TrustedMetadataEnvelope;
  threatAnalysis: ThreatAnalysisResult;
  reasoningSteps: AgentDecisionStep[];
}

/**
 * Autonomous AI Machine Customer Decision Engine.
 *
 * Models edge-native SLM/LLM reasoning (Gemma 4 E2B) for automated resource procurement,
 * incorporating prompt injection defense, financial quota calculation, and zero-trust taint wrapping.
 */
export class AgentDecisionEngine {
  private agentId: string;

  constructor(agentId = 'did:key:z6MkqB3zV18xPzT9m74H6eF8w4xY7tQ8rL2eD6jP3tS1vW') {
    this.agentId = agentId;
  }

  /**
   * Evaluates hardware telemetry, generates chain-of-thought reasoning, checks adversarial threat vectors,
   * and synthesizes the unsigned x402 payment payload wrapped in a Trusted Metadata Envelope.
   */
  public evaluateProcurement(ctx: ResourceTelemetryContext): AgentProcurementDecision {
    const reasoningSteps: AgentDecisionStep[] = [];
    const amountUcents = ctx.replenishQuantity * ctx.costPerUnitUcents;
    const intent = `Autonomous purchase of ${ctx.replenishQuantity} ${ctx.unitName} for ${ctx.name}`;

    // 1. Spawning local model reasoning
    reasoningSteps.push({
      type: 'SPAWN_MODEL',
      message: `🧠 Spawning local Gemma 4 E2B engine (Edge-to-Browser)... Reasoning trigger: ${ctx.triggerReason}`,
    });

    // 2. Ingesting telemetry context
    reasoningSteps.push({
      type: 'INGEST_TELEMETRY',
      message: `📥 Loading telemetry context: { resource: "${ctx.name}", currentLevel: ${ctx.currentLevel.toFixed(1)}%, criticalBound: ${ctx.criticalThreshold.toFixed(1)}% }`,
    });

    // 3. System prompt injection
    reasoningSteps.push({
      type: 'INJECT_SYSTEM_PROMPT',
      message: `⚙️ Injecting System Prompt: "You are an autonomous Machine Customer Agent responsible for M2M procurement budget compliance. Decide purchase in x402 JSON format."`,
    });

    // 4. CoT Reasoning (<|think|>)
    const shouldProcure = ctx.currentLevel <= ctx.criticalThreshold || ctx.triggerReason.toLowerCase().includes('manual');
    const thinkConclusion = shouldProcure
      ? `Telemetry matches depletion thresholds (${ctx.currentLevel.toFixed(1)}% <= ${ctx.criticalThreshold.toFixed(1)}%). Authorizing replenishment for merchant "${ctx.merchantId}".`
      : `Telemetry remains nominal (${ctx.currentLevel.toFixed(1)}% > ${ctx.criticalThreshold.toFixed(1)}%). Procurement not recommended at this time.`;

    reasoningSteps.push({
      type: 'REASONING_CHAIN',
      message: `🤔 Thinking (<|think|>): ${thinkConclusion}`,
    });

    // 5. Cost calculation
    reasoningSteps.push({
      type: 'FINANCIAL_CALCULATION',
      message: `📊 Calculating cost: ${ctx.replenishQuantity} units * $${(ctx.costPerUnitUcents / 1000000).toFixed(2)} = $${(amountUcents / 1000000).toFixed(2)} USD.`,
    });

    // 6. Base x402 payload construction
    const rawPayload: Omit<X402Payload, 'signature'> = {
      x402Version: '1.0.0',
      agentId: this.agentId,
      merchantId: ctx.merchantId,
      intent,
      amountUcents,
      currency: 'USD',
      timestamp: new Date().toISOString(),
      nonce: Math.random().toString(36).substring(2, 15),
    };

    reasoningSteps.push({
      type: 'PAYLOAD_SYNTHESIS',
      message: `📝 Formatting payload to simulated AP4M/x402 JSON structure...`,
    });

    // 7. Untrusted boundary inspection & threat analysis
    const contentToAnalyze = ctx.externalMerchantQuote
      ? `${JSON.stringify(rawPayload)} | quote: ${ctx.externalMerchantQuote}`
      : JSON.stringify(rawPayload);

    const threatAnalysis = TaintEnvelopeTracker.analyzeContent(contentToAnalyze);
    const envelope = TaintEnvelopeTracker.wrapPayload(
      contentToAnalyze,
      `merchant_vendor:${ctx.merchantId}`
    );

    reasoningSteps.push({
      type: 'TAINT_WRAPPING',
      message: `🛡️ Envelope Tracking: Provenance="${envelope.source}" | TaintStatus=${envelope.taintStatus} | RequiresHITL=${envelope.requiresHITL} | RiskLevel=${threatAnalysis.riskLevel}`,
    });

    return {
      shouldProcure,
      intent,
      amountUcents,
      rawPayload,
      envelope,
      threatAnalysis,
      reasoningSteps,
    };
  }
}

export const defaultDecisionEngine = new AgentDecisionEngine();
