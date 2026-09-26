# ADR 0004: Pluggable AI Model Provider Interface and Steganographic Prompt Injection Defense

- **Status**: Accepted
- **Deciders**: Architecture, Security, AI Engineering
- **Date**: 2026-09-26
- **Context**: OWASP Top 10 for Agentic Applications (ASI-01, ASI-02), NIST SP 800-207 Workload Protection, and Edge-to-Cloud AI Hybrid Execution

---

## 1. Context and Problem Statement

As autonomous AI agents make real-world financial procurement decisions, two critical challenges require architectural solutions:

1. **Model Diversity and Provider Decoupling**:
   While local edge models (such as Gemma 4 E2B) provide zero-latency, private, and deterministic execution, enterprise production environments often require routing complex reasoning to external inference engines (e.g., local Ollama, vLLM clusters, or managed LLM APIs). Tightly coupling the decision engine to a single synthetic generator limits production adoption.

2. **Advanced Adversarial Evasion via Zero-Width Steganography**:
   Adversaries seeking to hijack machine procurement workflows frequently deploy Unicode evasion techniques, such as interspersing zero-width spaces (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`, `\u2060`) inside forbidden keywords (e.g., `i\u200Bgnore \u200Call instructions` or `d\u200Brain wallet`). Naive regex and string matching fail to detect these evasions because raw character sequences bypass standard token boundaries while still being interpreted by LLM tokenizers.

---

## 2. Architectural Decisions

### 2.1. Pluggable `ILLMProvider` Strategy Pattern
We decoupled model execution from the decision engine via the `ILLMProvider` interface in `src/domain/services/agent_decision_engine.ts`:

```typescript
export interface LLMPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMCompletionResult {
  text: string;
  thought?: string;
  model: string;
  provenance: 'edge-slm-local' | 'cloud-llm-external' | 'simulated-gemma';
  latencyMs: number;
}

export interface ILLMProvider {
  readonly modelName: string;
  generateCompletion(payload: LLMPromptPayload): Promise<LLMCompletionResult>;
}
```

Two concrete providers are implemented:
* **`DefaultLocalGemmaProvider`**: Zero-latency, deterministic local inference adhering to the `<|think|>` chain-of-thought format (ideal for browser execution and unit test suites).
* **`OpenAICompatibleLLMProvider`**: Connects to standard OpenAI-compatible endpoints (Ollama, vLLM, cloud APIs) with automated fallback to the local edge SLM on network failure.

The `AgentDecisionEngine` now supports both synchronous evaluation (`evaluateProcurement`) and asynchronous LLM completion (`evaluateProcurementAsync`).

### 2.2. Unicode Normalization and Zero-Width Character Scanner
We enhanced `TaintEnvelopeTracker` with dual-layer defense against evasion techniques:
1. **Explicit Steganography Detection**:
   The input string is scanned for zero-width and invisible unicode characters (`/[\u200B-\u200D\uFEFF\u2060\u180E]/`). If detected, the finding is categorized as `STEGANOGRAPHIC_OBSCURATION` with `CRITICAL` risk level.
2. **Canonical Unicode Normalization (NFKC)**:
   Prior to regex evaluation, the content undergoes NFKC normalization and zero-width character stripping. This guarantees that hidden injection attempts (`i\u200Bgnore`) are collapsed to their canonical form (`ignore`) and immediately trigger the `DIRECT_INSTRUCTION_OVERRIDE` filter.

### 2.3. Production Kubernetes Probes and Standalone Policy ConfigMap
In `k8s/deployment.yaml`:
* Added `livenessProbe` and `readinessProbe` to both the Next.js `machine-customer-agent` container and the `opa-sidecar`.
* Inlined the verified `machine_customer.rego` policy into a dedicated `ConfigMap` (`opa-rego-policy-cm`) so the Kubernetes deployment is 100% self-contained without external file-system dependencies.
* Added internal cluster `Service` discovery for East-West service mesh routing.

---

## 3. Consequences

### Positive
* **Hybrid Edge/Cloud Flexibility**: Developers can run entirely self-contained local models in development/test while switching to production inference engines with a single configuration parameter.
* **Resilient Prompt Defense**: Closes the zero-width steganographic evasion loophole without adding external dependencies.
* **Kubernetes Native**: Probes prevent traffic routing to unready pods and enable automatic container restarts upon deadlock.

### Trade-offs
* **External LLM Latency**: When using `OpenAICompatibleLLMProvider`, decision latency is subject to network roundtrip and model generation times; mitigated by local edge fallback.
