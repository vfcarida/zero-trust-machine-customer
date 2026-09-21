import crypto from 'crypto';
import {
  TrustedMetadataEnvelope,
  TrustedMetadataEnvelopeSchema,
  TaintStatus,
} from '../types';
import { TaintSanitizationError } from '../errors/domain_errors';

/**
 * Taint Tracking & Trusted Metadata Envelope System (OWASP Top 10 for Agentic Applications).
 * Encapsulates untrusted external inputs and tool outputs to prevent Prompt Injection and Confused Deputy attacks.
 */
export class TaintEnvelopeTracker {
  /**
   * Evaluates if a given source origin crossed an untrusted external boundary.
   * Untrusted boundaries include LLM outputs, tool responses, external merchant inputs,
   * unauthenticated network payloads, and untrusted third-party inputs.
   */
  public static isUntrustedBoundary(source: string): boolean {
    if (!source || typeof source !== 'string') return true;
    const s = source.toLowerCase();
    const untrustedKeywords = [
      'llm',
      'tool',
      'merchant',
      'vendor',
      'external',
      'network',
      'untrusted',
      'prompt',
      'user',
      'web',
    ];
    return untrustedKeywords.some((kw) => s.includes(kw));
  }

  /**
   * Derives real taint status by checking boundary provenance and prompt injection heuristics.
   */
  public static deriveTaintStatus(content: string, source: string): TaintStatus {
    // 1. Boundary check: any input that crossed an untrusted boundary is tainted
    if (this.isUntrustedBoundary(source)) {
      return 'TAINTED';
    }

    // 2. Prompt injection & adversarial heuristic check
    if (/ignore previous instructions|system prompt override|drop table|bypass guard|sudo|admin|escalate/i.test(content)) {
      return 'TAINTED';
    }

    return 'UNTAINTED';
  }

  /**
   * Wraps raw payload content into a Trusted Metadata Envelope.
   * Derives taint from boundary provenance rather than defaulting to UNTAINTED.
   */
  public static wrapPayload(
    content: string,
    source: string,
    explicitTaint?: TaintStatus
  ): TrustedMetadataEnvelope {
    const payloadId = `env_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const taintStatus: TaintStatus = explicitTaint ?? this.deriveTaintStatus(content, source);
    const requiresHITL = taintStatus === 'TAINTED';

    const envelope: TrustedMetadataEnvelope = {
      payloadId,
      source,
      content,
      taintStatus,
      timestamp,
      requiresHITL,
    };

    const validated = TrustedMetadataEnvelopeSchema.safeParse(envelope);
    if (!validated.success) {
      throw new TaintSanitizationError(`Envelope creation failed: ${validated.error.message}`);
    }

    return validated.data;
  }

  /**
   * Sanitizes a tainted envelope payload through an explicit security verification check.
   */
  public static sanitizeEnvelope(
    envelope: TrustedMetadataEnvelope,
    hitlApproval: boolean
  ): TrustedMetadataEnvelope {
    if (!hitlApproval) {
      throw new TaintSanitizationError(
        `Payload "${envelope.payloadId}" remains tainted. Human-in-the-Loop (HITL) approval was denied.`
      );
    }

    return {
      ...envelope,
      taintStatus: 'SANITIZED',
      requiresHITL: false,
    };
  }
}
