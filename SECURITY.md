# Security Policy

## 🔒 Supported Versions

The following versions of `zero-trust-machine-customer` currently receive security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## 🚨 Reporting a Vulnerability

As an educational reference platform for Zero-Trust and Agentic Security, we take security vulnerabilities seriously, especially regarding:
* Cryptographic signature bypasses (RSA-2048, SHA-256)
* RFC 9449 DPoP proof forgery or replay attacks
* Boundary taint tracking escapes & indirect prompt injections
* Wallet Guard Mode firewall policy bypasses
* Spend ledger race conditions or double-spend vulnerabilities

### How to Report
Please do **NOT** file public GitHub issues for security vulnerabilities.

Instead, please report security vulnerabilities via:
1. **GitHub Private Security Advisory**: Submit via `https://github.com/vfcarida/zero-trust-machine-customer/security/advisories/new`
2. **Direct Security Contact**: Email `vinicius.carida@gmail.com` with the subject line `[SECURITY] zero-trust-machine-customer: <Brief Description>`.

### What to Include
* Description of the vulnerability and attack vector.
* Minimal reproducible test case or Proof-of-Concept (PoC).
* Potential security impact on machine customer autonomous procurement.

### Disclosure Timeline
* **Initial Response**: Within 48 hours.
* **Triage & Remediation Plan**: Within 7 business days.
* **Public Release & Advisory**: Coordinated following fix deployment and verification.
