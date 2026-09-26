import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrailManager } from '../../infrastructure/logging/audit_trail';

describe('Cryptographic AuditTrailManager (NIST SP 800-207 §3.4)', () => {
  let audit: AuditTrailManager;

  beforeEach(() => {
    audit = new AuditTrailManager('did:key:agent_audit_test');
  });

  it('records sequential audit events with valid SHA-256 cryptographic chain pointers', () => {
    const e1 = audit.recordEvent('AI_REASONING', { prompt: 'procure compute', decision: 'approved' });
    expect(e1.sequence).toBe(1);
    expect(e1.previousHash).toBe('GENESIS');
    expect(e1.hash).toMatch(/^[a-f0-9]{64}$/);

    const e2 = audit.recordEvent('GUARD_MODE_EVAL', { approved: true, limit: 50000000 });
    expect(e2.sequence).toBe(2);
    expect(e2.previousHash).toBe(e1.hash);
    expect(e2.hash).toMatch(/^[a-f0-9]{64}$/);

    const e3 = audit.recordEvent('SETTLEMENT_FINALIZED', { authCode: 'AUTH_123456', amountUcents: 8000000 });
    expect(e3.sequence).toBe(3);
    expect(e3.previousHash).toBe(e2.hash);
  });

  it('verifies integrity of an untampered hash chain', () => {
    audit.recordEvent('TELEMETRY_SAMPLE', { level: 18.0 });
    audit.recordEvent('AI_REASONING', { intent: 'replenish' });
    audit.recordEvent('DPOP_PROOF_MINTED', { jti: 'jti_abc' });
    audit.recordEvent('SETTLEMENT_COMMENCED', { txId: 'tx_999' });

    const verification = audit.verifyIntegrity();
    expect(verification.isValid).toBe(true);
    expect(verification.totalRecords).toBe(4);
    expect(verification.tamperedSequence).toBeUndefined();
  });

  it('detects tampering when payload data in a previous event is altered retrospectively', () => {
    audit.recordEvent('TELEMETRY_SAMPLE', { level: 18.0 });
    audit.recordEvent('GUARD_MODE_EVAL', { approved: false, reason: 'Limit breached' });
    audit.recordEvent('SETTLEMENT_COMMENCED', { txId: 'tx_fail' });

    // Adversary modifies historical event in-memory to conceal rejected policy
    const history = audit.getHistory();
    history[1].data = { approved: true, reason: 'Tampered' };

    // Create a new manager instance loaded with tampered history to simulate altered database/log
    const tamperedAudit = new AuditTrailManager();
    // @ts-expect-error accessing private property for adversarial testing
    tamperedAudit.chain = history;

    const verification = tamperedAudit.verifyIntegrity();
    expect(verification.isValid).toBe(false);
    expect(verification.tamperedSequence).toBe(2);
    expect(verification.reason).toContain('Tampered payload hash at sequence 2');
  });

  it('detects tampering when an audit event is deleted from the middle of the chain', () => {
    audit.recordEvent('TELEMETRY_SAMPLE', { k: 1 });
    audit.recordEvent('AI_REASONING', { k: 2 });
    audit.recordEvent('SETTLEMENT_COMMENCED', { k: 3 });

    const history = audit.getHistory();
    // Delete event 2
    history.splice(1, 1);

    const tamperedAudit = new AuditTrailManager();
    // @ts-expect-error accessing private property for adversarial testing
    tamperedAudit.chain = history;

    const verification = tamperedAudit.verifyIntegrity();
    expect(verification.isValid).toBe(false);
    // Either sequence continuity or previousHash link will fail
    expect(verification.tamperedSequence).toBeDefined();
  });

  it('exports valid JSON Lines formatted audit stream for SIEM ingestion', () => {
    audit.recordEvent('OPA_POLICY_EVAL', { allow: true, provenance: 'opa' });
    audit.recordEvent('SETTLEMENT_FINALIZED', { transactionId: 'tx_123' });

    const jsonl = audit.exportJsonLines();
    const lines = jsonl.split('\n');

    expect(lines.length).toBe(2);
    const parsed1 = JSON.parse(lines[0]);
    const parsed2 = JSON.parse(lines[1]);

    expect(parsed1.eventType).toBe('OPA_POLICY_EVAL');
    expect(parsed2.eventType).toBe('SETTLEMENT_FINALIZED');
    expect(parsed2.previousHash).toBe(parsed1.hash);
  });
});
