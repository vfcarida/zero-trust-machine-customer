import crypto from 'crypto';
import { logger } from './logger';

export type AuditEventType =
  | 'TELEMETRY_SAMPLE'
  | 'AI_REASONING'
  | 'GUARD_MODE_EVAL'
  | 'DPOP_PROOF_MINTED'
  | 'DPOP_PROOF_VERIFIED'
  | 'OPA_POLICY_EVAL'
  | 'TAINT_BOUNDARY_INTERCEPT'
  | 'ADVERSARIAL_ATTACK_DETECTED'
  | 'SETTLEMENT_COMMENCED'
  | 'SETTLEMENT_FINALIZED'
  | 'SETTLEMENT_RECONCILED'
  | 'SETTLEMENT_COMPENSATED';

export interface AuditRecord {
  sequence: number;
  eventId: string;
  timestamp: string;
  eventType: AuditEventType;
  agentId: string;
  data: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export interface AuditVerificationResult {
  isValid: boolean;
  tamperedSequence?: number;
  reason?: string;
  totalRecords: number;
}

/**
 * Cryptographic Tamper-Evident Audit Trail (NIST SP 800-207 §3.4 Continuous Diagnostics & Mitigation).
 *
 * Implements a verifiable SHA-256 cryptographic hash chain where each event record incorporates
 * the hash of the preceding record. Any retrospective insertion, deletion, modification,
 * or reordering of audit records invalidates the cryptographic verification check.
 */
export class AuditTrailManager {
  private chain: AuditRecord[] = [];
  private defaultAgentId: string;

  constructor(defaultAgentId = 'did:key:z6MkqB3zV18xPzT9m74H6eF8w4xY7tQ8rL2eD6jP3tS1vW') {
    this.defaultAgentId = defaultAgentId;
  }

  /**
   * Computes the deterministic SHA-256 digest of an audit record.
   */
  public static computeRecordHash(
    sequence: number,
    eventId: string,
    timestamp: string,
    eventType: AuditEventType,
    agentId: string,
    data: Record<string, unknown>,
    previousHash: string
  ): string {
    const canonicalString = JSON.stringify({
      sequence,
      eventId,
      timestamp,
      eventType,
      agentId,
      data,
      previousHash,
    });
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  /**
   * Appends an event to the audit trail and seals it with a cryptographic hash.
   */
  public recordEvent(
    eventType: AuditEventType,
    data: Record<string, unknown>,
    agentId?: string
  ): AuditRecord {
    const sequence = this.chain.length + 1;
    const eventId = `aud_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const effectiveAgentId = agentId || this.defaultAgentId;
    const previousHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : 'GENESIS';

    const hash = AuditTrailManager.computeRecordHash(
      sequence,
      eventId,
      timestamp,
      eventType,
      effectiveAgentId,
      data,
      previousHash
    );

    const record: AuditRecord = {
      sequence,
      eventId,
      timestamp,
      eventType,
      agentId: effectiveAgentId,
      data,
      previousHash,
      hash,
    };

    this.chain.push(record);

    logger.debug('Audit trail event recorded', {
      sequence,
      eventId,
      eventType,
      hash: `${hash.substring(0, 16)}...`,
    });

    return record;
  }

  /**
   * Verifies the full cryptographic hash chain from genesis to head.
   */
  public verifyIntegrity(): AuditVerificationResult {
    let expectedPreviousHash = 'GENESIS';

    for (let i = 0; i < this.chain.length; i++) {
      const record = this.chain[i];
      const expectedSequence = i + 1;

      // 1. Sequence monotonicity check
      if (record.sequence !== expectedSequence) {
        return {
          isValid: false,
          tamperedSequence: record.sequence,
          reason: `Broken sequence continuity: expected ${expectedSequence}, encountered ${record.sequence}.`,
          totalRecords: this.chain.length,
        };
      }

      // 2. Previous hash chain linkage check
      if (record.previousHash !== expectedPreviousHash) {
        return {
          isValid: false,
          tamperedSequence: record.sequence,
          reason: `Previous hash pointer mismatch at sequence ${record.sequence}: expected "${expectedPreviousHash.substring(0, 16)}...", found "${record.previousHash.substring(0, 16)}...".`,
          totalRecords: this.chain.length,
        };
      }

      // 3. Current hash integrity check
      const recomputedHash = AuditTrailManager.computeRecordHash(
        record.sequence,
        record.eventId,
        record.timestamp,
        record.eventType,
        record.agentId,
        record.data,
        record.previousHash
      );

      if (recomputedHash !== record.hash) {
        return {
          isValid: false,
          tamperedSequence: record.sequence,
          reason: `Tampered payload hash at sequence ${record.sequence}: recomputed "${recomputedHash.substring(0, 16)}...", recorded "${record.hash.substring(0, 16)}...".`,
          totalRecords: this.chain.length,
        };
      }

      expectedPreviousHash = record.hash;
    }

    return {
      isValid: true,
      totalRecords: this.chain.length,
    };
  }

  public getRecordCount(): number {
    return this.chain.length;
  }

  /**
   * Intentionally alters a historical record in-place to simulate tampering.
   * Useful for security audits, automated integrity tests, and live demonstrations.
   */
  public simulateTamper(sequence: number, corruptedData: Record<string, unknown>): boolean {
    const target = this.chain.find((r) => r.sequence === sequence);
    if (!target) return false;
    target.data = corruptedData;
    return true;
  }

  public getHistory(): AuditRecord[] {
    return [...this.chain];
  }

  public exportJsonLines(): string {
    return this.chain.map((record) => JSON.stringify(record)).join('\n');
  }

  public clear(): void {
    this.chain = [];
  }
}

export const globalAuditTrail = new AuditTrailManager();
