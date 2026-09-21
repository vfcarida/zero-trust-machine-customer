# Security Capability Matrix & Honest Control Taxonomy

- **Repository**: `zero-trust-machine-customer`
- **Standard Alignment**: NIST SP 800-207 (Zero Trust Architecture), NIST SP 800-204 (Microservices Security), RFC 9449 (DPoP), RFC 8693 (Token Exchange), OWASP Top 10 for LLM/Agentic Systems
- **Last Updated**: 2026-09-20 (Task ZTMC-T08)

---

## 1. Executive Summary

This document establishes the verified operational reality of all zero-trust security controls in the Zero Trust Machine Customer codebase. In accordance with zero-trust principles and honest engineering framing (ZTMC-T03, ZTMC-T07, ZTMC-T08), no decorative stubs or synthetic mocks are presented as production-conformant.

Every control is categorized into one of three operational states:
1. **REAL (Conformant & Enforced)**: Implemented with real cryptographic algorithms, strict RFC/specification compliance, and active fail-closed verification boundaries.
2. **SIMULATED / SYNTHETIC (Explicitly Labeled)**: Models the data structures, claims, or workflows of the target standard for standalone demonstrations, but without dialing external production servers, IdPs, or clearing networks. Clearly tagged with `simulated: true`, `synthetic: true`, and local provenance.
3. **HYBRID (Production Driver with Sandbox Fallback)**: Attempts connection to native drivers/SDKs when present on hardened host runners, but falls back gracefully to a high-fidelity local simulator for cross-platform portability.

---

## 2. Core Capability Matrix

| Control ID | Domain & Specification | Operational Status | Enforcement Behavior | Implementation Mechanism | Evidence Files & Test Suites |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **CTL-01** | **Policy Enforcement (OPA / Rego)**<br>`NIST SP 800-207 §3.1` | **REAL** *(Sidecar)* /<br>**STRICT FALLBACK** *(Dev)* | **Fail-Closed** in Strict Mode (`OPA_ENFORCE_STRICT=true`). Stamped provenance (`opa` vs `embedded-dev`). | Evaluates Rego policies (`machine_customer.rego`) via HTTP POST to OPA sidecar (`127.0.0.1:8181`). If unreachable, denies in strict mode or falls back to embedded AST evaluator in dev. | • `src/infrastructure/authorization/opa_client.ts`<br>• `src/infrastructure/authorization/policies/machine_customer.rego`<br>• `src/test/integration/opa_policy.test.ts` |
| **CTL-02** | **Proof-of-Possession (RFC 9449 DPoP)**<br>`IETF RFC 9449` | **REAL** | **Fail-Closed**. Replay rejection, freshness enforcement, cryptographic signature verification. | Generates and verifies real `dpop+jwt` ES256 proofs using Node WebCrypto. Enforces embedded JWK thumbprint match, HTTP method/URI binding (`htm`/`htu`), access token hash (`ath`), ±60s clock skew, and single-use JTI replay cache. Forbids `sim_sig_` bypasses. | • `src/infrastructure/auth/dpop.ts`<br>• `src/app/api/transmit-ziti/route.ts`<br>• `src/test/unit/dpop.test.ts` (12 tests) |
| **CTL-03** | **Delegated Authority (RFC 8693 Token Exchange)**<br>`IETF RFC 8693` | **SIMULATED**<br>*(Explicitly Labeled)* | **Transparent Simulation**. Generates ephemeral DPoP-bound tokens and models `act` claims. | Local token minting utility. Models nested actor delegation chains (`Human User -> Machine Customer -> Downstream API`) and PKCE S256 verifiers. No external Authorization Server (AS) validates subject tokens or enforces `may_act`. Outputs tagged `simulated: true`. | • `src/infrastructure/auth/oauth2_1.ts`<br>• `src/domain/types.ts`<br>• `src/test/unit/oauth2_1.test.ts` |
| **CTL-04** | **Workload Identity (SPIFFE / SPIRE)**<br>`NIST SP 800-204A` | **SYNTHETIC**<br>*(Explicitly Labeled)* | **Synthetic Keypair**. Raw RSA-2048 SPKI public key (NOT an X.509 certificate). | Generates valid SPIFFE ID (`spiffe://zero-trust.machine.customer/workload/machine-customer-agent`) and ephemeral RSA keypairs. No local SPIRE Workload API daemon (`agent.sock`) is dialed in standalone mode. Outputs tagged `synthetic: true`, `simulated: true`. | • `src/infrastructure/auth/spiffe.ts`<br>• `src/domain/types.ts`<br>• `src/test/unit/spiffe.test.ts` |
| **CTL-05** | **Overlay Network (OpenZiti Dark Host)**<br>`NIST SP 800-207 §3.2` | **HYBRID** | **Driver Probe + Sandbox Fallback**. Outbound-only zero-trust ingress avoidance. | Probes for native `@openziti/ziti-sdk-nodejs` module. If available, dials service over encrypted Ziti overlay mesh. If uninstalled on dev host, executes high-fidelity simulated egress pipeline with structured trace logs. | • `src/lib/ziti_server.ts`<br>• `src/app/api/transmit-ziti/route.ts`<br>• `src/app/api/transmit-ziti/route.test.ts` |
| **CTL-06** | **Payment Settlement & Ledger (x402 Protocol)**<br>`HTTP 402 / AP4M Architecture` | **REAL STATE MACHINE** /<br>**SIMULATED RAIL** | **Fail-Closed**. Nonce idempotency, rolling spend limit enforcement, compensation. | Explicit 6-state transaction lifecycle (`PENDING`, `AUTHORIZED`, `SETTLING`, `SETTLED`, `FAILED`, `COMPENSATED`), durable file/in-memory spend ledger, ambiguous outcome reconciliation/voiding. Payment rail executes against an internal mock simulator rather than live clearing banks. | • `src/domain/services/settlement_state_machine.ts`<br>• `src/domain/services/spend_ledger.ts`<br>• `src/application/services/settlement_service.ts`<br>• `src/test/integration/settlement_lifecycle.test.ts` |

---

## 3. Deep Dive: Control Implementations & Evidence

### 3.1. Open Policy Agent (OPA / Rego) — Policy Decision Point
- **Operational Reality**: The architecture supports both real sidecar deployment and standalone local development.
- **Strict Mode (`OPA_ENFORCE_STRICT=true`)**: When running in production Kubernetes (where an OPA container runs alongside the workload on `127.0.0.1:8181`), network or service failures trigger immediate fail-closed denial (`allow: false`).
- **Dev Mode (`OPA_ENFORCE_STRICT=false`)**: If the sidecar is absent during local development, the system falls back to an embedded evaluator and stamps `provenance: "embedded-dev"` onto all audit entries.
- **Evidence**: `src/infrastructure/authorization/opa_client.ts:60-112`, verified in `src/test/integration/opa_policy.test.ts`.

### 3.2. RFC 9449 DPoP (Proof-of-Possession)
- **Operational Reality**: **100% Real Cryptographic Enforcement**.
- **Cryptographic Primitives**: Uses Node WebCrypto / SubtleCrypto to verify ES256 (ECDSA P-256 with SHA-256) signatures.
- **Enforcement Rules**:
  - Embedded JWK is converted to a cryptographic key and verified against the JWS signature.
  - Rejects tokens with `sim_sig_` or `sim_` bypass strings.
  - Enforces clock skew within a strict ±60s window (`iat`).
  - Strict URI (`htu`) and HTTP method (`htm`) binding against the receiving endpoint.
  - Access token hash (`ath`) binding using SHA-256 base64url encoding.
  - In-memory single-use JTI cache rejects duplicate proof replay attempts.
- **Evidence**: `src/infrastructure/auth/dpop.ts`, verified across 12 adversarial test cases in `src/test/unit/dpop.test.ts`.

### 3.3. RFC 8693 OAuth 2.0 Token Exchange
- **Operational Reality**: **Explicitly Labeled Simulation**.
- **Capabilities**:
  - Encapsulates PKCE code verifiers (S256) in ephemeral single-use memory.
  - Constructs RFC 8693 compliant nested actor claim hierarchies (`ActorClaim` with `sub`, `iss`, and nested `act`).
- **Limitations & Disclaimers**:
  - No external Authorization Server (e.g., Keycloak, Okta, ZITADEL) is contacted.
  - The `may_act` relationship is not validated against an enterprise identity directory.
  - Outputs are stamped with `simulated: true`, `provenance: "simulated-local-dev"`, and a diagnostic note.
- **Evidence**: `src/infrastructure/auth/oauth2_1.ts:50-89`, tested in `src/test/unit/oauth2_1.test.ts`.

### 3.4. SPIFFE / SPIRE Workload Identity
- **Operational Reality**: **Explicitly Labeled Synthetic Keypair**.
- **Capabilities**:
  - Generates valid SPIFFE URIs matching `spiffe://<trust-domain>/workload/<agent>`.
  - Generates local RSA-2048 keypairs encoded in SPKI/PKCS#8 PEM format.
- **Honest Framing & Rectifications (ZTMC-F06, ZTMC-T08)**:
  - **No False X.509 Claims**: The output field is explicitly named `rawPublicKeyPem` (`-----BEGIN PUBLIC KEY-----`). The codebase does NOT claim or format this raw public key as an ASN.1 X.509 certificate.
  - **No Fake Trust Chain**: The trust bundle is marked `SYNTHETIC-SPIFFE-TRUST-BUNDLE`.
  - **No Agent Socket**: The module does not dial `unix:///run/spire/sockets/agent.sock` in standalone mode.
  - Outputs are stamped with `simulated: true`, `synthetic: true`, and `provenance: "synthetic-local-dev"`.
- **Evidence**: `src/infrastructure/auth/spiffe.ts:25-88`, tested in `src/test/unit/spiffe.test.ts`.

### 3.5. OpenZiti Zero Trust Overlay
- **Operational Reality**: **Hybrid Client Probe with Deterministic Local Sandbox**.
- **Capabilities**:
  - Attempts dynamic runtime loading of `@openziti/ziti-sdk-nodejs`.
  - In environments with precompiled OpenZiti C-SDK bindings, establishes overlay identity sessions and dials services without exposing inbound listening ports (Dark Host architecture).
  - On developer hosts without C-toolchains, falls back to a sandbox simulation logging zero-trust overlay telemetry.
- **Evidence**: `src/lib/ziti_server.ts:10-40`, `src/app/api/transmit-ziti/route.ts:55-80`.

### 3.6. Payment Settlement & Spend Ledger (x402 / AP4M)
- **Operational Reality**: **Real State Machine & Ledger on Simulated Rail**.
- **Capabilities**:
  - **Explicit Lifecycle**: Transactions progress through a deterministic state machine (`PENDING -> AUTHORIZED -> SETTLING -> SETTLED | FAILED | COMPENSATED`).
  - **Idempotency**: Requests are strictly keyed on the payment `nonce`. Replayed nonces return cached responses without re-executing or double-charging.
  - **Durable Spend Ledger**: Persists transaction records to disk (`.data/spend_ledger.json`), enforcing rolling 24-hour spending caps that survive application restarts.
  - **Ambiguous Outcomes**: Interrupted or timed-out settlements enter an ambiguous state and trigger automatic compensation/voiding routines.
- **Limitations**:
  - Clearing and settlement execute against an internal mock provider (`MockSettlementProvider`); no live card or bank networks are connected.
- **Evidence**: `src/domain/services/settlement_state_machine.ts`, `src/domain/services/spend_ledger.ts`, `src/application/services/settlement_service.ts`, tested in `src/test/integration/settlement_lifecycle.test.ts`.

---

## 4. Summary & Verification Instructions

To independently verify the status and invariants documented in this capability matrix:

```powershell
# 1. Typecheck ensuring single canonical types and zero type errors
npm run typecheck

# 2. Run unit tests verifying DPoP cryptography, honest simulation labels, and SPIFFE key checks
npx vitest run src/test/unit/dpop.test.ts src/test/unit/oauth2_1.test.ts src/test/unit/spiffe.test.ts

# 3. Run full integration suite verifying OPA fail-closed PDP and transaction state machine
npx vitest run --fileParallelism=false

# 4. Run Next.js standalone container build
npm run build
```
