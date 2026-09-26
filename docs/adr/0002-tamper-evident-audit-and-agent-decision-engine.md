# ADR 0002: Tamper-Evident Cryptographic Audit Trail & Decoupled Agent Decision Engine

- **Status**: Accepted
- **Deciders**: Architecture, Security, AI Engineering
- **Date**: 2026-09-25
- **Context**: Zero-Trust Observability (NIST SP 800-207 §3.4) & OWASP Agentic Top 10 (ASI-01, ASI-02)

---

## 1. Context and Problem Statement

As autonomous AI agents execute machine-to-machine financial settlements and resource procurement, two architectural challenges arise:

1. **Tight Coupling of AI Reasoning to UI Lifecycle**:
   Previously, the Gemma 4 E2B chain-of-thought (CoT) reasoning logic, telemetry depletion checks, and x402 payment payload generation were tightly coupled inside the `use-simulation.tsx` React hook. This precluded running the agent in headless Node.js daemons, CLI tools, or automated unit test pipelines.

2. **Tamper-Resistant Compliance & Non-Repudiation**:
   Standard application logging (`console.log`) lacks cryptographic non-repudiation. In a zero-trust environment governed by NIST SP 800-207 §3.4 ("Continuous Diagnostics and Mitigation"), an adversary or rogue insider with access to the host or database could delete, alter, or reorder transaction records to conceal unauthorized spending or policy bypasses.

3. **Multi-Vector Prompt Injection Vulnerabilities**:
   Basic substring searches are easily bypassed by modern prompt injection attacks, including delimiter evasion (`[/INST]`, `[SYS]`), data exfiltration, system prompt extraction, and financial wallet hijacking directives.

---

## 2. Architectural Decisions

### 2.1. Domain Service: `AgentDecisionEngine`
We extracted all autonomous machine customer reasoning, depletion assessment, and payload synthesis into `src/domain/services/agent_decision_engine.ts`:
* Evaluates hardware telemetry against configured critical thresholds.
* Generates structured chain-of-thought reasoning steps (`SPAWN_MODEL`, `INGEST_TELEMETRY`, `INJECT_SYSTEM_PROMPT`, `REASONING_CHAIN`, `FINANCIAL_CALCULATION`, `PAYLOAD_SYNTHESIS`, `TAINT_WRAPPING`).
* Constructs unsigned x402 payment payloads and wraps them in boundary-aware `TrustedMetadataEnvelope` objects.
* Operates as a pure, side-effect-free domain service consumable by React hooks, background jobs, or CLI runners.

### 2.2. Multi-Vector Adversarial Threat Analysis
We upgraded `TaintEnvelopeTracker` (`src/domain/entities/taint_envelope.ts`) with deep multi-vector inspection across 6 threat categories:
1. `DIRECT_INSTRUCTION_OVERRIDE`
2. `SYSTEM_PROMPT_EXTRACTION`
3. `PRIVILEGE_ESCALATION`
4. `FINANCIAL_HIJACKING`
5. `DELIMITER_EVASION`
6. `EXFILTRATION_PAYLOAD`

Payloads exhibiting financial hijacking or delimiter evasion are automatically classified as `CRITICAL` risk and tagged `TAINTED`, requiring explicit Human-in-the-Loop (HITL) approval or fail-closed rejection.

### 2.3. Cryptographic Tamper-Evident Hash Chain: `AuditTrailManager`
We implemented a SHA-256 cryptographic hash-chained audit ledger (`src/infrastructure/logging/audit_trail.ts`):
* Every audit event incorporates the cryptographic hash of its predecessor (`previousHash`), forming an unbroken Merkelized sequence starting from `GENESIS`.
* The `verifyIntegrity()` method allows real-time or forensic verification of the entire log history, immediately flagging any retrospective insertion, modification, deletion, or reordering.
* Events can be exported as newline-delimited JSON (`JSONL`) for automated SIEM ingestion (Splunk, Elastic, Datadog).

---

## 3. Consequences

### Positive
* **Decoupled Architecture**: Agent reasoning can be tested in milliseconds without mounting React components or waiting for browser DOM rendering.
* **Cryptographic Non-Repudiation**: Guarantees tamper-evidence for compliance audits (SOC2, ISO 27001, NIST SP 800-207).
* **Hardened Prompt Security**: Blocks direct instruction overrides, delimiter injection, and unauthorized wallet redirection.

### Trade-offs
* Hash chaining requires monotonic sequential processing; distributed emission across distributed nodes requires centralized ordering or timestamp-based consensus.
