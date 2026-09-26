# Contributing to Zero-Trust Machine Customer 🤖🔒

Thank you for your interest in contributing to **Zero-Trust Machine Customer**! We welcome contributions from engineers, researchers, and security specialists exploring Non-Human Identity (NHI) and Autonomous Agentic Commerce.

---

## 🛠️ Development Setup

### Prerequisites
* **Node.js**: `v20.x` or higher (`v24.x` recommended)
* **npm**: `v10.x` or higher
* **Git**: `2.30+`

### Initial Installation
```bash
# Clone the repository
git clone https://github.com/vfcarida/zero-trust-machine-customer.git
cd zero-trust-machine-customer

# Install exact dependencies
npm ci

# Start development server
npm run dev
```

The simulator dashboard will be available at `http://localhost:3000`.

---

## 🧪 Verification & Quality Standards

Before submitting a Pull Request, all changes must satisfy our automated validation gate:

```bash
# 1. Typecheck: Must exit with 0 errors
npm run typecheck

# 2. Test Suite: Execute Vitest test suite
# Note: On Windows, use --fileParallelism=false to avoid thread spawn contention
npx vitest run --fileParallelism=false

# 3. Production Build: Ensure Next.js standalone container assets compile cleanly
npm run build
```

---

## 📐 Coding Standards & Guidelines

1. **Strict TypeScript**:
   * No implicit `any` types.
   * Prefer immutable types (`readonly`, `Record<string, unknown>`, canonical Zod schemas in `src/domain/types.ts`).
2. **Language Consistency**:
   * All code, comments, documentation, and user-facing UI labels must be written in **clear international English**.
3. **Fail-Closed Security Primitives**:
   * Never introduce simulation bypasses (e.g. `sim_sig_`, bypass tokens, or hardcoded `'UNTAINTED'`).
   * All cryptographic signatures and token proofs must fail closed upon any decoding or verification anomaly.
4. **Honest Architectural Framing**:
   * Maintain the honest taxonomy established in [docs/CAPABILITY_MATRIX.md](docs/CAPABILITY_MATRIX.md). Mark synthetic components with explicit diagnostic tags (`synthetic: true`, `simulated: true`).

---

## 🔄 Pull Request Workflow

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. Commit your changes following conventional commit syntax (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
3. Push to your branch and open a Pull Request against `main`.
4. Ensure all GitHub Actions CI checks (`Code Quality, Testing & Security Audit`) pass cleanly.
