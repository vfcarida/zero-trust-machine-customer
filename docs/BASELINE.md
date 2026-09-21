# ZTMC Baseline & Preflight Report (ZTMC-T01)

**Task ID**: ZTMC-T01  
**Repository**: `https://github.com/vfcarida/zero-trust-machine-customer`  
**Baseline Git Commit SHA**: `1a07c5d298d7d4b4b3256d5c7efd405717a66d11`  
**Generated At**: 2026-09-18T21:30:00-03:00  
**Status**: Executed & Documented (Real dynamic execution)  

---

## 1. Environment & Preflight

| Property | Value | Status |
| :--- | :--- | :--- |
| **Operating System** | Microsoft Windows 11 Pro (`10.0.26200.0`, `win32 x64`) | Compatible |
| **Node.js Runtime** | `v24.16.0` | Pass (Prerequisite &ge; 20 satisfied) |
| **npm Version** | `10.9.1` | Pass |
| **Initial Git Status** | `nothing to commit, working tree clean` | Clean |
| **Target Baseline SHA** | `1a07c5d298d7d4b4b3256d5c7efd405717a66d11` | Verified Match |
| **Package Identity** | `"name": "gemmabridge"`, `"version": "0.1.0"` | Re-skin present |
| **Dependencies** | Next.js 16.2.6, React 19.2.4, Zod 3.23.8, Vitest 4.1.6 | Installed |
| **Missing Native SDKs**| No `@openziti/ziti-sdk-nodejs`, JOSE, OPA, or SPIFFE native SDKs | Documented |

---

## 2. Dependency Installation (`npm ci`)

- **Command**: `npm ci`
- **Exit Code**: `0`
- **Summary**:
  - Installed 470 packages in 4 minutes (`audited 471 packages`).
  - Warning: `npm warn deprecated whatwg-encoding@3.1.1`.
  - Vulnerability Audit: 13 vulnerabilities reported (1 low, 3 moderate, 8 high, 1 critical) in transitive dependencies.

---

## 3. Test Suite Status (`npm test` / Vitest)

### 3.1 Standard Test Command (`npm test`)
- **Command**: `npm test` (`vitest run`)
- **Exit Code**: `1`
- **Result Summary**:
  - **Passed Test Files**: 2 passed
    - `src/test/unit/oauth2_1.test.ts` (2 tests passed)
    - `src/test/unit/dpop.test.ts` (3 tests passed)
  - **Total Passing Tests**: 5 tests passed
  - **Failed Test Files**: 7 test files encountered pool worker timeouts:
    - `src/lib/agent_pay_protocol.test.ts`
    - `src/hooks/use-simulation.test.tsx`
    - `src/app/api/transmit-ziti/route.test.ts`
    - `src/lib/AgentGuardMode.test.ts`
    - `src/test/unit/agent_kernel.test.ts`
    - `src/test/adversarial/prompt_injection.test.ts`
    - `src/test/integration/opa_policy.test.ts`
  - **Root Cause**: Vitest v4.1.6 forks pool worker startup timed out on Windows under default parallel pool concurrency (`[vitest-pool-runner]: Timeout waiting for worker to respond` after 60s timeout).

### 3.2 Sequential Diagnostic Run (`npx vitest run --fileParallelism=false`)
To isolate test logic health from Windows worker spawning contention, the suite was executed sequentially:
- **Command**: `npx vitest run --fileParallelism=false`
- **Exit Code**: `0` (Clean Pass)
- **Duration**: 24.44s
- **Files**: 9 passed / 9 total (100%)
- **Tests**: 43 passed / 43 total (100%)
- **Findings**: When file parallelism is disabled or run sequentially, 100% of the unit, integration, and adversarial tests pass logically without assertion errors.

---

## 4. `sim_sig` Assertion Test Status (Relevant to T02)

- **Target Test**: `src/lib/agent_pay_protocol.test.ts:85-91`
  ```typescript
  it('should fall back to simulated signature on signing failure (invalid key format)', () => {
    const signature = signX402Payload(validBasePayload, 'invalid-pem-key');
    expect(signature).toContain('sim_sig_');
    
    const payloadWithSig: X402Payload = { ...validBasePayload, signature };
    expect(verifyX402Payload(payloadWithSig, 'some-public-key')).toBe(true);
  });
  ```
- **Execution Command**: `npx vitest run src/lib/agent_pay_protocol.test.ts`
- **Exit Code**: `0` (All 13 tests in file passed)
- **Duration**: 2.70s
- **Current Status**: **PASSES TODAY**
- **Captured Runtime Output**:
  ```text
  stderr | src/lib/agent_pay_protocol.test.ts > Agent Pay Protocol (AP4M / x402) > sign and verify > should fall back to simulated signature on signing failure (invalid key format)
  Cryptographic signature failed, falling back to simulated signature: error:1E08010C:DECODER routines::unsupported
  ```
- **Architectural Observation (T02 context)**:
  - `signX402Payload` catches `error:1E08010C:DECODER routines::unsupported` when an invalid PEM is supplied and silently returns `sim_sig_${crypto.randomBytes(16).toString('hex')}` (`src/lib/agent_pay_protocol.ts:140`).
  - `verifyX402Payload` contains an explicit bypass: if `payload.signature.startsWith('sim_sig_')`, it unconditionally returns `true` (`src/lib/agent_pay_protocol.ts:153-155`), completely bypassing cryptographic verification.
  - This confirms the baseline behavior flagged for remediation in T02.

---

## 5. Static Linting Status (`npm run lint`)

- **Command**: `npm run lint` (`eslint`)
- **Exit Code**: `1`
- **Summary**: 45 problems (29 errors, 16 warnings; 1 error potentially fixable with `--fix`)
- **Breakdown of Violations**:
  1. `@typescript-eslint/no-explicit-any` (23 errors):
     - `src/app/api/transmit-ziti/route.test.ts:31`
     - `src/app/api/transmit-ziti/route.ts:81`
     - `src/application/use-cases/execute_purchase.ts:125`
     - `src/hooks/use-simulation.tsx:103, 448`
     - `src/infrastructure/auth/dpop.ts:126`
     - `src/infrastructure/authorization/opa_client.ts:60`
     - `src/lib/agent_pay_protocol.test.ts:40, 46, 117`
     - `src/lib/agent_pay_protocol.ts:38, 97, 138, 166`
     - `src/lib/ziti_server.ts:6, 16, 27, 36, 59, 84, 91, 99, 103, 127, 150`
  2. `@typescript-eslint/no-require-imports` (1 error):
     - `src/lib/ziti_server.ts:13:15` (`require(zitiModuleName)`)
  3. `react-hooks/set-state-in-effect` (1 error):
     - `src/hooks/use-simulation.tsx:117:5` (`setMounted(true)` called synchronously within `useEffect`)
  4. `react-hooks/immutability` (1 error):
     - `src/hooks/use-simulation.tsx:234:15` (`triggerAIProcurement` accessed before declaration)
  5. `react-hooks/exhaustive-deps` (1 warning):
     - `src/hooks/use-simulation.tsx:250:6` (`triggerAIProcurement` missing from dependency array)
  6. `prefer-const` (1 error):
     - `src/lib/ziti_server.ts:92:17` (`chunks` is never reassigned)
  7. `@typescript-eslint/no-unused-vars` (17 warnings):
     - Unused imports in `src/app/ledger/page.tsx`, `src/app/network/page.tsx`, `src/components/MachineCustomerSimulator.tsx`, `src/components/layout/sidebar.tsx`, `src/hooks/use-simulation.test.tsx`, `src/hooks/use-simulation.tsx`, and `src/infrastructure/llm/llm_adapter.ts`.

---

## 6. Typecheck Status (`npm run typecheck`)

- **Script Added to `package.json`**: `"typecheck": "tsc --noEmit"`
- **Command**: `npm run typecheck`
- **Exit Code**: `1`
- **Captured Errors**:
  ```text
  src/application/use-cases/execute_purchase.ts(1,38): error TS2305: Module '"../../domain/types"' has no exported member 'X402SettlementResponse'.
  src/domain/types.ts(67,14): error TS7022: 'ActorClaimSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
  src/domain/types.ts(70,15): error TS7024: Function implicitly has return type 'any' because it does not have a return type annotation and is referenced directly or indirectly in one of its return expressions.
  ```
- **Root Cause Analysis**:
  1. `src/application/use-cases/execute_purchase.ts:1` attempts to import `X402SettlementResponse` from `../../domain/types`, but `X402SettlementResponse` is defined in `src/lib/agent_pay_protocol.ts` and not exported from `src/domain/types.ts`.
  2. `src/domain/types.ts:67,70` defines a recursive Zod schema (`ActorClaimSchema` with `z.lazy(...)`) without explicit typing annotations, triggering circular type inference errors in TypeScript's strict mode.

---

## 7. Next.js Production Build (`npm run build`)

- **Command**: `npm run build` (`next build`)
- **Exit Code**: `1`
- **Turbopack Build Phase**:
  - Compiled successfully in 17.4s with 2 warnings:
    - `./src/lib/ziti_server.ts:13:15`: Warning `Module not found: Can't resolve '@openziti/ziti-sdk-nodejs'`.
    - `./next.config.ts`: Warning `Encountered unexpected file in NFT list`.
- **TypeScript Verification Phase**:
  - Failed during type check:
    ```text
    ./src/application/use-cases/execute_purchase.ts:1:38
    Type error: Module '"../../domain/types"' has no exported member 'X402SettlementResponse'.
    Next.js build worker exited with code: 1 and signal: null
    ```

### Containerization / Standalone Build Findings (Issue ZTMC-F10)
- **`Dockerfile` Inconsistency**:
  - `Dockerfile:31`: `COPY --from=builder --chown=machineagent:machinecustomer /app/.next/standalone ./`
  - `Dockerfile:41`: `CMD ["node", "server.js"]`
- **`next.config.ts` Reality**:
  ```typescript
  import type { NextConfig } from "next";
  const nextConfig: NextConfig = {
    /* config options here */
  };
  export default nextConfig;
  ```
- **Finding (ZTMC-F10)**:
  - `next.config.ts` does **not** specify `output: "standalone"`.
  - Even after fixing the TypeScript errors, standard `next build` will not produce `.next/standalone` or `server.js`.
  - Docker container builds using the current `Dockerfile` will fail at Stage 2 during asset copy until `output: 'standalone'` is added to `next.config.ts`.

---

## 8. Summary Matrix

| Check | Command | Exit Code | Baseline Status | Notes / Blockers |
| :--- | :--- | :---: | :--- | :--- |
| **Dependencies** | `npm ci` | `0` | Installed | 470 packages added, 13 audit vulnerabilities |
| **Test Suite** | `npm test` | `1` | Partial (2/9 files, 5 tests passed) | Fork pool timeout on Windows; sequential run yields 43/43 pass |
| **`sim_sig` Test** | `npx vitest run agent_pay_protocol.test.ts` | `0` | Passed (13/13) | `sim_sig` fallback test passes as expected; bypass verified |
| **Linter** | `npm run lint` | `1` | 45 problems | 29 errors (mostly `any`, React hooks, require), 16 warnings |
| **Type Checker** | `npm run typecheck` | `1` | 3 errors | Missing export `X402SettlementResponse`, circular Zod inference |
| **Next Build** | `npm run build` | `1` | Build failure | Turbopack compiles; fails at TypeScript check (`TS2305`); missing `standalone` |

---

## 9. Next Actions & Handoff (T02–T08)

1. **ZTMC-T02**: Refactor `agent_pay_protocol.ts` and tests to eliminate `sim_sig` security bypass.
2. **ZTMC-T03/T04**: Fix TypeScript errors (`TS2305` and `TS7022`/`TS7024` in `execute_purchase.ts` and `types.ts`).
3. **ZTMC-T05**: Fix ESLint errors and React Hook immutability/rendering errors in `use-simulation.tsx`.
4. **ZTMC-F10**: Enable `output: "standalone"` in `next.config.ts` to unblock Docker container builds.
