# ADR 0001: Wire or Delete Dead "Enterprise" Modules

- **Status**: Accepted
- **Deciders**: Engineering / Security Architecture
- **Date**: 2026-09-19
- **Context**: Task ZTMC-T03 (Honest Framing + Wire-or-Delete + Real Taint)

---

## 1. Context and Problem Statement

The repository was initially organized with an extensive Domain-Driven Design (DDD) Clean Architecture structure (`src/domain/`, `src/application/`, `src/infrastructure/`) claiming production-grade compliance with NIST SP 800-207, NIST SP 800-204, OWASP Agentic Top 10, RFC 8693, RFC 9449, and Mastercard AP4M (x402 protocol).

However, code audit (evidence ZTMC-F02) revealed that the live interactive browser application (`src/hooks/use-simulation.tsx`, `src/components/MachineCustomerSimulator.tsx`) executed completely decoupled from this DDD stack, importing only local helper modules (`lib/agent_pay_protocol`, `lib/AgentGuardMode`, `lib/utils`). Meanwhile, the "enterprise" modules were either:
1. Pure decorative stubs never invoked by the application or tests (e.g., `mcp_client.ts`, `llm_adapter.ts`, `env.ts`, `exchange_token.ts`).
2. Orphaned use cases with broken type signatures and hardcoded taint bypasses (e.g., `execute_purchase.ts:80` with hardcoded `'UNTAINTED'`).
3. Demonstration implementations evaluated in isolated unit tests but not yet integrated into the live end-to-end execution path (e.g., OPA, DPoP, OAuth 2.1, SPIFFE).

This ADR records the concrete per-module decisions: which components are wired onto the live execution path (with verified tests), which are retained as simulated demonstrations pending downstream milestone tasks (T04–T08), and which truly dead adapters are deleted.

---

## 2. Decision Matrix: Module Inventory

| Module Path | Category | Decision | Rationale & Status |
| :--- | :--- | :---: | :--- |
| `src/domain/types.ts` | Shared Schema | **KEEP & WIRE** | Core schema definitions used across route handlers, kernel, and taint envelopes. Resolved recursive Zod type inference (`ActorClaimSchema`). |
| `src/domain/entities/taint_envelope.ts` | Security Core | **KEEP & WIRE** | Core OWASP Agentic defense entity. Upgraded from hardcoded `'UNTAINTED'` to real boundary-derived taint inspection (`deriveTaintStatus`) and wired into the live procurement pipeline (`use-simulation.tsx`). |
| `src/domain/errors/domain_errors.ts` | Error Taxonomy | **KEEP & WIRE** | Standardized domain exception hierarchy used by `AgentKernel`, `TaintEnvelopeTracker`, and authentication managers. |
| `src/application/kernel/agent_kernel.ts` | Policy Kernel | **KEEP & WIRE** | Rate limiting, quota tracking, and OPA policy evaluation boundary. Tested via `agent_kernel.test.ts` and `prompt_injection.test.ts`; live integration target for ZTMC-T04. |
| `src/infrastructure/authorization/opa_client.ts` | Policy-as-Code | **KEEP & WIRE** | Embedded Rego engine and OPA client. Tested in `opa_policy.test.ts`; slated for full live route wiring in ZTMC-T04. |
| `src/infrastructure/authorization/policies/machine_customer.rego` | Policy-as-Code | **KEEP & WIRE** | Core Rego security policy rules governing daily spend limits, allowlists, and taint state. |
| `src/infrastructure/auth/dpop.ts` | Authentication | **REAL & ENFORCED** | Real cryptographic RFC 9449 ES256 proof generation and fail-closed verification wired at the API route boundary with JTI replay cache (ZTMC-T05). |
| `src/infrastructure/auth/oauth2_1.ts` | Delegation | **LABELED SIMULATION** | Explicitly labeled RFC 8693 token exchange simulation (`simulated: true`, `provenance: 'simulated-local-dev'`). Models PKCE and nested `act` delegation chains without upstream AS validation (ZTMC-T08). |
| `src/infrastructure/auth/spiffe.ts` | Non-Human Identity | **LABELED SYNTHETIC** | Synthetic workload identity generating raw SPKI public keys (`rawPublicKeyPem`), explicitly marked `synthetic: true`, `simulated: true`. No false X.509 claims (ZTMC-T08). |
| `src/infrastructure/logging/logger.ts` | Observability | **KEEP & WIRE** | Structured JSON logging used across server route handlers and kernel. |
| `src/application/use-cases/execute_purchase.ts` | Use Case | **DELETE** | Dead decorative use case with broken imports (`TS2305`), hardcoded taint bypass, and 0 callers/tests. Cleaned in favor of the live UI simulation pipeline. |
| `src/domain/services/agent_reasoning.ts` | Domain Service | **DELETE** | Orphaned mock reasoning generator used exclusively by `execute_purchase.ts`. |
| `src/application/mcp/mcp_client.ts` | Tool Discovery | **DELETE** | Unused stub registering mock endpoints (`localhost:8080/oauth2/mcp`). 0 callers, 0 tests. |
| `src/infrastructure/llm/llm_adapter.ts` | AI Routing | **DELETE** | Unused mock LLM provider router returning hardcoded strings. 0 callers, 0 tests. |
| `src/infrastructure/config/env.ts` | Configuration | **DELETE** | Unused static environment loader never consumed by the Next.js runtime. 0 callers, 0 tests. |
| `src/application/use-cases/exchange_token.ts` | Use Case | **DELETE** | Redundant 1-line wrapper around `OAuth21Client`. 0 callers, 0 tests. |

---

## 3. Real Untrusted-Input Taint Tracking Strategy

Prior to this decision, `TaintEnvelopeTracker` allowed callers to pass an arbitrary `initialTaint` string, and the dead use case hardcoded `'UNTAINTED'`.

The updated architecture eliminates hardcoded taint:
1. **Boundary-Aware Provenance**: `TaintEnvelopeTracker.deriveTaintStatus(content, source)` inspects the origin boundary:
   - External Merchant Catalog / API (`source` containing `merchant`, `vendor`, `external`, `network`) &rarr; **`TAINTED`**.
   - Model / LLM Output (`source` containing `llm`, `reasoning`, `tool`) &rarr; **`TAINTED`**.
   - Prompt Injection Heuristics (e.g., regex matching instruction override attempts) &rarr; **`TAINTED`**.
   - Verified Internal Hardware Telemetry Sensors &rarr; **`UNTAINTED`**.
2. **Live Execution Wiring**: `src/hooks/use-simulation.tsx` wraps all proposed transaction intents into `TaintEnvelopeTracker` using the active merchant source (`merchant_input:${res.merchantId}`).
3. **Defense-in-Depth**: Tainted envelopes require explicit Human-in-the-Loop (HITL) approval or policy sanitization before automated settlement can proceed.

---

## 4. Consequences

### Positive
- Eliminates 6 dead/decorative files (~400 lines of orphaned code) that created false impressions of production capabilities.
- Resolves all existing TypeScript build blockers (`TS2305`, `TS7022`, `TS7024`).
- Provides a single, unified, verifiable live execution path for machine customer transactions.
- Establishes honest, verifiable documentation aligned with real software behavior.

### Negative / Trade-offs
- Downstream tasks (T04–T08) will wire advanced features (real OPA gateway checks, real DPoP verification, full OAuth delegation) directly onto the surviving API route and simulator paths rather than maintaining unused DDD use cases.
