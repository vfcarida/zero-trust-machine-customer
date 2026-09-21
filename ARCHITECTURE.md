# Zero Trust Machine Customer (NHI & M2M Architectural Blueprint)

> [!NOTE]
> **Status Banner**: Educational single-page simulator of zero-trust and agentic-commerce concepts. The payment rail and OpenZiti transport are simulated; advanced identity controls are demonstrations, not enforced.

---

## Architectural Paradigm

The **Zero Trust Machine Customer** platform provides an educational reference architecture for studying autonomous edge AI agents operating as a Non-Human Identity (NHI). The design is conceptually guided by **NIST SP 800-207** (Zero Trust Architecture) and **NIST SP 800-204** (Microservice Security) frameworks.

Unlike production financial infrastructure, this system is an interactive educational simulator. It models how machine customers might formulate procurement intents, apply boundary taint analysis, execute cryptographic signing, enforce wallet policies, and simulate dark-overlay transmission.

---

## Technical Security Matrix

```mermaid
graph TD
    subgraph Machine_Customer_Runtime [Machine Customer Simulation Boundary]
        A[Simulated Telemetry Sensor] -->|Telemetry Drop < 20%| B[Agent Reasoning / Simulation Loop]
        B -->|Formulate Intent| C[Bespoke AP4M / x402 JSON Payload]
        C -->|RSA-2048 Digital Signing| D[Cryptographically Signed Payload]
        D -->|Wrap with Boundary Taint| E[Trusted Metadata Envelope / Taint Tracker]
        E -->|Intercept Request| F[AgentGuardMode / Execution Kernel]
    end

    subgraph Dynamic_Authorization [Demonstration Policy-as-Code Engine]
        F -->|Query Context| G[Open Policy Agent / OPA Rego Engine]
        G -->|Allow / Deny Decision| F
    end

    subgraph Identity_and_Transit [Demonstration Identity & Transport]
        F -->|Acquire SVID (Demo)| H[SPIFFE/SPIRE Synthetic SVID Handler]
        F -->|Bind DPoP Proof (Demo)| I[RFC 9449 DPoP Key Manager]
        F -->|Request Token (Demo)| J[RFC 8693 Token Exchange Handler]
        J -->|Simulated Transmission| K[OpenZiti Overlay Network (Simulated)]
    end

    subgraph Target_Acquirer [Merchant Settlement Simulation]
        K -->|Encrypted Payload| L[API Gateway Verification Route]
        L -->|Verify RSA Signature & Settle| M[Simulated Settlement Response]
    end
```

---

## Security Demonstration Layer Details

### 1. Payment Protocol Realism & Boundaries
- **Demonstration Payload**: The transaction structure is a **bespoke JSON payload** created for this educational simulator. It is **not** an official or conformant Coinbase x402 protocol or Mastercard Agent Pay implementation. Future production targets would align with AP2 mandates or standard x402 specs.
- **Fail-Closed Cryptography**: Digital signing uses genuine Node.js `crypto` RSA-2048 keypairs and SHA-256 signatures with fail-closed verification. The insecure `sim_sig_` bypass has been completely eliminated (ZTMC-T02).

### 2. OWASP Agentic Top 10 Taint Tracking
- **Boundary Provenance**: `TaintEnvelopeTracker` classifies inputs crossing untrusted external boundaries (external merchant responses, LLM outputs, tool responses) as `TAINTED`.
- **Injection Defense**: Regex heuristics inspect content for instruction override and prompt injection patterns. Tainted payloads require explicit Human-in-the-Loop (HITL) authorization.

### 3. Wallet Guard Mode Firewall
- **Local Policy Enforcement**: `AgentGuardMode.ts` evaluates per-transaction maximum caps, cumulative 24-hour spend limits, and vendor allowlists before allowing any request to leave the agent boundary.

### 4. Policy-as-Code Demonstration (OPA / Rego)
- Rego rules (`src/infrastructure/authorization/policies/machine_customer.rego`) model external authorization decisions, verifying daily quota, allowlists, and taint state. Evaluated via `OpaClient` and `AgentKernel`.

### 5. Non-Human Identity & Delegation Demonstrations (RFC 8693 & RFC 9449)
- **RFC 8693 Token Exchange**: Models actor claim (`act`) propagation across delegation chains (`Human Owner -> Machine Agent -> Merchant API`).
- **RFC 9449 DPoP**: Models proof-of-possession binding to local asymmetric keypairs.
- **SPIFFE/SPIRE**: Models X.509 SVID generation for service identity attestation.
- *Note*: These identity modules are educational demonstration implementations and unit-tested models, not enterprise-deployed network services.

### 6. OpenZiti Dark Overlay Simulation
- Models outbound-only zero-trust overlay mesh routing without open public ingress ports. Operates via mock simulation with optional native `@openziti/ziti-sdk-nodejs` support.
