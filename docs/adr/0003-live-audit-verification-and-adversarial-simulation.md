# ADR 0003: Live Audit Verification API and OWASP Agentic Adversarial Simulation

- **Status**: Accepted
- **Deciders**: Architecture, Security, AI Engineering
- **Date**: 2026-09-26
- **Context**: NIST SP 800-207 §3.4 (Continuous Diagnostics & Mitigation) & OWASP Agentic Safety (ASI-01, ASI-02)

---

## 1. Context and Problem Statement

Following the foundational implementation of the cryptographic audit trail and the decoupled AI decision engine in ADR 0002, two operational requirements emerged:

1. **Continuous Remote Verification & SIEM Streaming**:
   Security Operations Centers (SOCs) and external auditor pipelines require a standardized HTTP API to query the hash-chained audit ledger, stream audit records in standard NDJSON format for SIEM ingestion (Splunk, Elastic, Sentinel), and trigger automated integrity proofs on demand.

2. **Interactive Adversarial Testing & Verification Harness**:
   To validate that zero-trust boundaries and Confused Deputy mitigations operate as designed, developers, security auditors, and users must be able to actively inject prompt injection payloads into the autonomous machine customer and observe:
   * Real-time threat classification across OWASP Agentic attack categories (`DIRECT_INSTRUCTION_OVERRIDE`, `FINANCIAL_HIJACKING`, `SYSTEM_PROMPT_EXTRACTION`, `DELIMITER_EVASION`, `PRIVILEGE_ESCALATION`).
   * Fail-closed containment before the agent signs payment transactions with its RSA-2048 private key.
   * Cryptographic sealing of the security incident into the audit trail.
   * Real-time detection of data tampering via the SHA-256 hash continuity verification engine.

---

## 2. Architectural Decisions

### 2.1. Dedicated Audit Trail API Route (`/api/audit-trail`)
We implemented `src/app/api/audit-trail/route.ts` supporting standard enterprise operations:
* **Streaming NDJSON Export (`GET /api/audit-trail?format=jsonl`)**: Emits JSON-Lines formatted stream directly compatible with fluent-bit, logstash, or curl-based archiving pipelines.
* **On-Demand Integrity Verification (`POST /api/audit-trail { action: "verify" }`)**: Executes full sequence and SHA-256 hash pointer verification across all blocks from `GENESIS` to head, returning sequence-level breach reports if any block has been tampered with.
* **Security Incident Recording (`POST /api/audit-trail { action: "record_event" }`)**: Seals `ADVERSARIAL_ATTACK_DETECTED` events into the chain with threat categories, risk ratings, and mitigation actions.
* **Tamper Simulation Engine (`POST /api/audit-trail { action: "simulate_tamper" }`)**: Enables testing verification monitors and security alerts against simulated database modifications.

### 2.2. Interactive Adversarial Threat Testbed in UI
We introduced an interactive Prompt Injection Simulator in `src/components/MachineCustomerSimulator.tsx`:
* Pre-configured with realistic attack vectors matching OWASP Top 10 for Agentic Applications.
* Passes untrusted vendor quotes into `AgentDecisionEngine.evaluateProcurement({ externalMerchantQuote })`.
* If `threatAnalysis.isMalicious` is true:
  1. The agent logs the detected threat categories in the local AI reasoning console.
  2. The transaction is marked `TAINTED` and classified `CRITICAL`.
  3. Execution halts **before signing**: the agent's private key is never invoked.
  4. The event is sealed in the cryptographic audit trail via `/api/audit-trail`.
  5. The spend ledger registers a `BLOCKED` entry.

### 2.3. Dual-View Ledger & Audit Dashboard
We enhanced `src/app/ledger/page.tsx` with a dual-mode tab interface:
* **M2M Transaction Ledger**: Detailed inspection of 6-state settlements, rolling spend quotas, and OpenZiti encrypted tunnels.
* **Cryptographic Audit Trail (NIST SP 800-207 §3.4)**: Live visualization of the SHA-256 hash chain, previousHash pointers, block payload inspection, direct SIEM JSONL export, and live verification controls.

---

## 3. Consequences

### Positive
* **Auditor-Ready**: Instant verification of non-repudiation and proof of integrity for SOC2/ISO audits.
* **SIEM Pipeline Integration**: Standard NDJSON streaming allows out-of-the-box ingestion into enterprise log aggregators.
* **Hands-On Adversarial Defense Demonstration**: Demonstrates the real-world difference between naive LLM automation and zero-trust machine customer containment.

### Trade-offs
* **Client-Server Synchronization**: In-memory audit events generated on the server (`/api/transmit-ziti`) and client-side simulator events are synchronized through HTTP calls, requiring network roundtrips during simulation.
