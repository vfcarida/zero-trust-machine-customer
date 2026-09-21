# Zero-Trust Machine Customer 🤖🔒

> [!NOTE]
> **Status Banner**: Educational single-page simulator of zero-trust and agentic-commerce concepts. The payment rail and OpenZiti transport are simulated; advanced identity controls are demonstrations, not enforced.

[![Simulator Tests](https://github.com/vfcarida/zero-trust-machine-customer/actions/workflows/ci.yml/badge.svg)](https://github.com/vfcarida/zero-trust-machine-customer/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NIST Guidelines](https://img.shields.io/badge/NIST-SP%20800--207%20%7C%20SP%20800--204%20(Conceptual)-blue)](https://csrc.nist.gov/publications/detail/sp/800-207/final)
[![OWASP Agentic Alignment](https://img.shields.io/badge/OWASP-Agentic%20Top%2010%20(Demonstration)-red)](https://owasp.org/)

An educational simulation platform for exploring **Autonomous AI Machine Customers** operating under **Zero Trust Architecture (ZTA)** and **Non-Human Identity (NHI)** principles.

The platform simulates edge-native machine procurement. A browser-based AI agent simulator monitors simulated hardware compute/coolant telemetry, reasons over replenishment needs, generates and cryptographically signs a **bespoke JSON payment payload** (inspired by AP2 mandates and the x402 HTTP payment concept, but not a conformant Coinbase x402 or Mastercard Agent Pay implementation), evaluates wallet Guard Mode compliance, and transmits the transaction to an API route simulating dark **OpenZiti** overlay routing and vendor settlement.

---

## 🧭 Payment & Security Protocol Framing

* **Payment Protocol**: The payment message is a **bespoke demonstration payload**, not an official or conformant Coinbase x402 protocol or Mastercard Agent Pay for Machines (AP4M) implementation. Real future targets would adhere to AP2 mandates or the emerging Coinbase x402 specification.
* **Cryptographic Signing**: Uses genuine RSA-2048 keypair generation and canonical SHA-256 digital signatures with fail-closed verification (no bypasses).
* **Transport**: OpenZiti transport operates in simulation mode with mock mesh routing; native `@openziti/ziti-sdk-nodejs` integration is optional and graceful.
* **Identity Controls**: RFC 8693 token exchange, RFC 9449 DPoP proofs, and SPIFFE X.509 SVID generation exist as educational demonstration models and unit-tested components, not production-enforced network infrastructure.

---

## 🚀 Architecture & Key Demonstrations

* **Local-First Simulation Loop**: Client-side state machine (`use-simulation.tsx`) modeling telemetry consumption, agent reasoning logs, signature generation, and Guard Mode evaluation.
* **Zero-Trust Guard Mode**: Wallet-local firewall (`AgentGuardMode.ts`) enforcing rate limits, per-transaction caps, and merchant allowlists.
* **Real Untrusted-Input Taint Tracking**: Boundary-aware provenance analysis (`TaintEnvelopeTracker`) classifying external merchant inputs, LLM outputs, and prompt injection signatures as `TAINTED`.
* **Fail-Closed Cryptographic Verification**: Strict RSA-SHA256 signature checking (`agent_pay_protocol.ts`) rejecting forged, unsigned, or mismatched payment intents.
* **Demonstration Identity & Policy Models**:
  * **RFC 8693 Token Exchange**: Demonstrates actor claim (`act`) propagation across delegation chains (`oauth2_1.ts`).
  * **RFC 9449 DPoP**: Demonstrates binding tokens to localized keypairs (`dpop.ts`).
  * **SPIFFE/SPIRE**: Demonstrates workload identity concepts via synthetic X.509 SVID generation (`spiffe.ts`).
  * **Policy-as-Code (OPA / Rego)**: Rego policy rules (`machine_customer.rego`) evaluated via `OpaClient` and `AgentKernel`.

---

## 🏗️ Clean Source Tree

```text
src/
├── app/                         # Next.js 16 App Router UI & API Gateway Routes
│   ├── api/transmit-ziti/       # API Route verifying signatures & simulating settlement
│   ├── ledger/                  # Transaction history ledger page
│   ├── network/                 # OpenZiti overlay network visualization page
│   ├── security/                # Guard Mode & policy configuration page
│   └── page.tsx                 # Main simulator dashboard
├── components/                  # React UI components (MachineCustomerSimulator, AppShell)
├── domain/                      # Core Domain Entities & Schemas
│   ├── entities/taint_envelope  # Boundary-aware Taint Tracking & Metadata Envelopes
│   ├── errors/domain_errors     # Standardized domain error taxonomy
│   └── types.ts                 # Zod schemas & TypeScript types
├── application/                 # Enforcement Kernel
│   └── kernel/agent_kernel.ts   # AgentKernel quota tracking & OPA policy enforcement
├── infrastructure/              # Demonstrations & External Integration
│   ├── auth/                    # OAuth 2.1 (RFC 8693), DPoP (RFC 9449), SPIFFE SVID
│   ├── authorization/           # OPA Client & machine_customer.rego policy
│   └── logging/logger.ts        # Structured SIEM-compatible JSON logger
├── hooks/                       # useSimulation React hook driving live UI state
├── lib/                         # Core Cryptographic & Protocol Utilities
│   ├── agent_pay_protocol.ts    # RSA-2048 keygen, SHA-256 signing & fail-closed verify
│   ├── AgentGuardMode.ts        # Wallet firewall & transaction evaluation rules
│   └── ziti_server.ts           # OpenZiti mesh routing simulation
└── test/                        # Vitest Test Suites
    ├── unit/                    # Protocol, DPoP, OAuth, Taint, Kernel unit tests
    ├── adversarial/             # Prompt injection & security red teaming tests
    └── integration/             # OPA policy resolution tests
```

---

## ⚙️ Quickstart & Local Execution

### Prerequisites
* **Node.js**: v20 or higher
* **npm**: v10 or higher

### Running Locally
```bash
# 1. Install dependencies
npm ci

# 2. Start development server
npm run dev

# 3. Open browser at http://localhost:3000
```

---

## 🧪 Testing Pyramid & Static Verification

```bash
# Run Vitest test suite
npx vitest run --fileParallelism=false

# Run TypeScript static type check
npm run typecheck

# Run Next.js production build
npm run build

# Run ESLint analysis
npm run lint
```
