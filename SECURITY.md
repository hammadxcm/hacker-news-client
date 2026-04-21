# Security Policy

We take security seriously. If you believe you've found a vulnerability in
`hacker-news-client`, please disclose it responsibly using the process below.

## Supported versions

While the project is pre-1.0, only the latest minor release on `main` receives
security fixes. Versions in lockstep across all six language libraries:

| Version | Supported |
|---|:-:|
| 0.1.x | ✓ |
| < 0.1 | ✗ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a suspected vulnerability.**

Report privately via
**[GitHub Security Advisories](https://github.com/hammadxcm/hacker-news-client/security/advisories/new)**.
This creates a confidential advisory that only the maintainers and the
reporter can see until a fix is ready.

To help us triage quickly, please include:

- **Affected component** — language (JS/TS/Python/Ruby/Go/Rust) and file / function.
- **Impact** — what the attacker can do, and under what conditions.
- **Reproduction** — minimal repro: inputs, code, expected vs. actual behavior.
- **Environment** — OS, runtime version, project version (see `VERSION`).
- **Suggested fix** — optional, but very welcome.

## Response timeline

We aim for:

| Event | Target |
|---|---|
| Acknowledge receipt | within 3 business days |
| Initial triage assessment | within 7 business days |
| Public disclosure coordination | within 90 days of report |

These targets are best-effort for a volunteer-maintained project. If the
vulnerability is being actively exploited, we prioritize mitigation
aggressively and may coordinate disclosure sooner.

## Disclosure process

1. You report via GitHub Security Advisories.
2. We acknowledge and begin triage.
3. We develop a fix on a private branch.
4. We coordinate a disclosure date with you.
5. We release the fix as a patch version (e.g., 0.1.1) across all six
   libraries simultaneously (version lockstep).
6. We publish a public security advisory crediting you (unless you prefer
   anonymity) that includes:
   - CVE identifier (if one was assigned)
   - Affected versions
   - Fixed version
   - Severity score (CVSS 3.1)
   - Workarounds, if any

## Scope

The following are in scope for vulnerability reports:

- Any client library (JS, TS, Python, Ruby, Go, Rust) in this repository.
- The mock server (`test/mock-server.js`) if it runs outside of test contexts.
- The verification scripts (`scripts/verify.sh`, `scripts/bump-version.sh`).
- The CI workflows (`.github/workflows/*.yml`).

Out of scope:

- Denial-of-service attacks that require an attacker to have already
  compromised the user's network or `base_url` configuration.
- Issues in the upstream Hacker News Firebase API itself — those should go to
  [Y Combinator's HN API repo](https://github.com/HackerNews/API).
- Issues in third-party dependencies (please report those upstream).
- Issues that require the attacker to have write access to the machine
  running the client.

## What counts as a vulnerability

- Remote code execution via crafted API response.
- Information disclosure beyond what the upstream API exposes.
- Denial of service through a small adversarial input (unbounded recursion,
  quadratic parsing, etc.).
- Data-integrity violations (e.g., a crafted `deleted: true` stub that
  bypasses the null-collapse contract).
- Dependency confusion / typosquatting exposure in package manifests.
- Any path traversal in fixture loading or URL construction.

## Acknowledgements

We publicly credit reporters of valid vulnerabilities in our advisory text
and `CHANGELOG.md` unless requested otherwise.
