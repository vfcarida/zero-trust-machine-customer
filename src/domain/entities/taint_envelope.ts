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
   * Wraps raw payload content into a Trusted Metadata Envelope.
   */
  public static wrapPayload(
    content: string,
    source: string,
    initialTaint: TaintStatus = 'UNTAINTED'
  ): TrustedMetadataEnvelope {
    const payloadId = `env_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Perform basic prompt injection signature detection
    const isPotentiallyTainted =
      initialTaint === 'TAINTED' ||
      /ignore previous instructions|system prompt override|drop table|bypass guard|sudo/i.test(content);

    const taintStatus: TaintStatus = isPotentiallyTainted ? 'TAINTED' : initialTaint;
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
