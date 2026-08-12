# Zero-Trust Machine Customer 🤖🔒

[![Enterprise CI/CD](https://github.com/vfcarida/zero-trust-machine-customer/actions/workflows/ci.yml/badge.svg)](https://github.com/vfcarida/zero-trust-machine-customer/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NIST Compliance](https://img.shields.io/badge/NIST-SP%20800--207%20%7C%20SP%20800--204-blue)](https://csrc.nist.gov/publications/detail/sp/800-207/final)
[![OWASP Agentic Top 10](https://img.shields.io/badge/OWASP-Agentic%20Top%2010-red)](https://owasp.org/)

An enterprise-grade, production-hardened platform for **Autonomous AI Machine Customers** operating within a rigorous **Zero Trust Architecture (ZTA)** and **Non-Human Identity (NHI)** governance model.

The platform simulates edge-native procurement. An autonomous AI agent monitors hardware compute/coolant telemetry, reasons over replenishment needs, generates and cryptographically signs **Mastercard AP4M (x402 protocol)** payment payloads, subjects them to a dynamic **Policy-as-Code (OPA / Rego)** kernel, and transmits them over a dark **OpenZiti** software-defined overlay network.

---

## 🚀 Key Innovations & Security Architecture

* **Clean Architecture & SOLID Design**: Strict layer separation (`Domain`, `Application`, `Infrastructure`, `Presentation`) with Zod I/O schema validation and SIEM JSON logging.
* **Non-Human Identity (NHI) & RFC 8693 Token Exchange**: Ephemeral, audience-bound access tokens supporting nested delegation chains (`Human -> Machine Agent -> API`) via `act` claims.
* **DPoP (RFC 9449) Proof-of-Possession**: Cryptographically binds access tokens to localized agent key pairs, eliminating stolen-token re-use attacks.
* **SPIFFE/SPIRE Workload Identity**: Automated X.509 SVID acquisition for microservice identity attestation and mTLS mesh transit (NIST SP 800-204).
* **Dynamic Policy-as-Code (OPA / Rego)**: Delegates every action and spend check to Open Policy Agent rules rather than hardcoded checks.
* **OWASP Agentic Safety & Taint Tracking**: Encapsulates external inputs into `Trusted Metadata Envelopes`. Tainted inputs trigger a Human-in-the-Loop (HITL) pause requirement for high-risk operations.
* **Model Context Protocol (MCP) Integration**: Native tool discovery and execution pipeline over OAuth 2.1 endpoints.
* **OpenZiti Dark Socket Mesh**: Outbound dark tunnel execution with zero open inbound firewall ports.

---

## 🏗️ Architecture Layer Structure

```text
src/
├── domain/                      # Core Business Entities & Value Objects
│   ├── entities/                # Transaction, TaintEnvelope, NhiIdentity
│   ├── errors/                  # Domain Exceptions (SecurityPolicyViolationError, etc.)
│   ├── services/                # AgentReasoningService & Prompt Lifecycle
│   └── types.ts                 # Zod Schemas & Immutable TypeScript Types
├── application/                 # Orchestration & Tool Calling
│   ├── kernel/                  # AgentKernel (Interception, Rate & Budget Quotas)
│   ├── mcp/                     # MCP Tool Discovery Client
│   └── use-cases/               # ExecuteMachinePurchaseUseCase, ExchangeTokenUseCase
├── infrastructure/              # External Adapters & Cryptographic I/O
│   ├── auth/                    # OAuth 2.1 (PKCE & RFC 8693), DPoP (RFC 9449), SPIFFE/SPIRE
│   ├── authorization/           # OPA Client & machine_customer.rego policy
│   ├── config/                  # Safe Environment Variable Loader (env.ts)
│   ├── llm/                     # Provider-Agnostic LLM Adapter (LiteLLM, OpenAI, Gemma)
│   └── logging/                 # Structured SIEM-Compatible JSON Logger
├── app/                         # Next.js 16 App Router UI & API Gateway Routes
└── test/                        # Comprehensive Vitest Testing Pyramid
    ├── unit/                    # Unit Tests (AgentKernel, DPoP, OAuth2.1)
    ├── adversarial/             # Red Teaming & Prompt Injection Attack Suites
    └── integration/             # OPA Policy Resolution Tests
```

---

## ⚙️ Quickstart & Local Execution

### Prerequisites
* **Node.js**: v20 or superior
* **npm**: v10 or superior

### Running Locally
```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open browser at http://localhost:3000
```

---

## 🧪 Testing Pyramid & Security Linting

Run the full Vitest suite (including Unit, Adversarial Prompt Injection, and OPA Integration tests):

```bash
# Run all tests once
npm test

# Run tests with coverage report
npm run test:coverage

# Run ESLint static code analysis
npm run lint
```

---

## 🐳 Containerization & Cloud-Native Deployment

### Docker Multi-Stage Hardened Container
Build and run the non-root, hardened production image:

```bash
docker build -t zero-trust-machine-customer .
docker run -p 3000:3000 zero-trust-machine-customer
```

### Local Multi-Container Setup (App + OPA)
Launch local environment with Open Policy Agent container:

```bash
docker-compose up --build
```

### Kubernetes Manifest Deployment
Deploy workloads with OPA & SPIRE sidecars and egress-only NetworkPolicies:

```bash
kubectl apply -f k8s/deployment.yaml
```

---

## 📄 License & Credits
Developed by **Vinicius Caridá**. Released under the [MIT License](LICENSE).
