# Contributing to hacker-news-client

Thank you for considering a contribution! This project is a six-language client suite for the [Hacker News Firebase API](https://github.com/HackerNews/API). Every contribution — bug report, doc fix, code change — is welcome.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Table of contents

- [Before you start](#before-you-start)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Running tests and lint](#running-tests-and-lint)
- [Branching and commits](#branching-and-commits)
- [Quality gates](#quality-gates)
- [Adding or changing a method](#adding-or-changing-a-method)
- [Docs changes](#docs-changes)
- [Pull-request process](#pull-request-process)
- [Release process](#release-process)
- [Reporting security issues](#reporting-security-issues)
- [License](#license)

## Before you start

- Search existing [issues](https://github.com/hammadxcm/hacker-news-client/issues) and [discussions](https://github.com/hammadxcm/hacker-news-client/discussions) to avoid duplicate work.
- For non-trivial changes, open a discussion or issue first to align on approach — saves wasted work on both sides.
- Read [`DESIGN.md`](./DESIGN.md) and [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). The contract is load-bearing: every library must implement it identically.

## Ways to contribute

- **File a bug** — use the bug-report [issue template](./.github/ISSUE_TEMPLATE/bug_report.yml). Include the language, version, minimal repro, expected, and actual behavior.
- **Suggest a feature** — use the feature-request [issue template](./.github/ISSUE_TEMPLATE/feature_request.yml). Describe the problem first, the proposal second.
- **Improve docs** — README, per-language READMEs, `ARCHITECTURE.md`, doc comments in source. These are high-impact and low-risk.
- **Fix a bug or implement a feature** — see [Pull-request process](#pull-request-process) below.
- **Answer a discussion** — helping others is itself a contribution.

## Development setup

### Prerequisites

| Tool | Minimum |
|---|---|
| Node.js | 20.0 |
| Python | 3.10 |
| Ruby | 3.1 |
| Go | 1.22 |
| Rust (stable) | 1.80 |
| Git | 2.30 |

macOS/Linux are well-supported. Windows users should use WSL2 for the shell scripts in `scripts/`.

### First-time clone

```bash
git clone https://github.com/hammadxcm/hacker-news-client.git
cd hacker-news-client
npm install          # installs husky + eslint + prettier + c8 at the root
npm test             # runs scripts/verify.sh end-to-end across all 6 languages
```

`npm install` also wires the Husky hooks:

- **pre-commit** — runs `lint-staged` on touched files + mock-server smoke test.
- **pre-push** — runs the full `scripts/verify.sh` verification harness.

Skipping hooks (`git commit --no-verify`) is discouraged. If the hook fails, fix the issue; don't bypass it.

### Per-language installs

Each language installs its own dev deps:

| Language | Install |
|---|---|
| Python (linter + coverage) | `pip install --user ruff mypy coverage` |
| Ruby (linter + test gems) | `cd ruby && bundle install` |
| Rust (coverage) | `cargo install cargo-llvm-cov --locked && rustup component add llvm-tools-preview` |

The npm root workspace covers JS/TS via `npm install`.

## Running tests and lint

From the repo root:

```bash
npm test                  # scripts/verify.sh — full cross-language matrix
npm run lint              # all six linters in sequence
npm run coverage          # coverage reports per language
```

Per-language:

```bash
# Mock server (shared fixtures)
node --test test/*.test.js

# JS / TS
cd js  && node --test test/*.test.js
cd ts  && npm test

# Python
cd python && python3 -m unittest discover tests

# Ruby
cd ruby && rake test

# Go
cd go && go test ./...

# Rust
cd rust && cargo test
```

## Branching and commits

1. **Fork** the repository (external contributors) or **branch from `main`** (maintainers).
2. Branch names:
   - `feat/<short-desc>` for new features
   - `fix/<short-desc>` for bug fixes
   - `docs/<short-desc>` for documentation
   - `chore/<short-desc>` for tooling, config, dependencies
   - `refactor/<short-desc>` for internal changes without behavior change
   - `test/<short-desc>` for test-only changes

3. **Conventional Commits.** Every commit must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) spec. Types in use: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `revert`.

   Scope is the language directory or component:

   ```
   feat(js):     add comment_tree max-depth option
   fix(python):  close HTTPError response object to silence ResourceWarning
   docs(readme): add shields.io tech-icon grid
   chore(deps):  bump eslint from 9.13.0 to 9.14.0
   test(ruby):   add race-condition coverage for semaphore path
   ```

4. **Signed-off-by is optional** at v0.x. We'll revisit for v1.0.

## Quality gates

Every PR must satisfy **all** of the following before merge:

- [ ] `npm run lint` — all six linters green.
- [ ] `bash scripts/verify.sh` — all six language test suites pass.
- [ ] `npm run coverage` — no coverage regression vs. `main`.
- [ ] `main` CI workflows pass: `ci.yml`, `lint.yml`, `codeql.yml`.
- [ ] New public API is **doc-commented** in the language's idiomatic doc format (JSDoc / TSDoc / YARD / Google Python / godoc / rustdoc) with at least one `@example`.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` describing the change (Keep-a-Changelog format).
- [ ] Docs are updated if behavior changes.

The pre-commit and pre-push hooks enforce most of this locally.

## Adding or changing a method

The project's one load-bearing invariant: **every library implements the same conceptual API**. Adding a method means touching all six implementations, all six test suites, and — if new wire behavior — the shared mock fixtures.

Use `item()` as the reference template. For a new method `foo()`:

1. **Update `DESIGN.md` §3** — add the method to the conceptual surface table with inputs, outputs, null semantics.
2. **Update the mock server** — add the route in `test/mock-server.js` if the wire protocol changes.
3. **Update fixtures** — add JSON files under `test/fixtures/` if new responses are needed.
4. **Implement in all six libraries** (order of least to most friction):
   - `js/src/client.js`
   - `ts/src/client.ts`
   - `python/src/hacker_news_client/client.py`
   - `ruby/lib/hacker_news/client.rb`
   - `go/client.go`
   - `rust/src/client.rs`
5. **Add integration tests** against the mock server for each language (`test/test_client.*`).
6. **Add unit tests** that mock the transport directly (`test/test_unit.*` / `tests/test_unit.py` / `tests/unit.rs`).
7. **Confirm coverage holds** via `npm run coverage`.
8. **Update** `README.md` feature matrix and per-language READMEs.
9. **Add a `CHANGELOG.md` entry.**

Idiomatic naming per language:

| Language | Convention |
|---|---|
| JS / TS | `camelCase` — `commentTree`, `topStories` |
| Python / Ruby | `snake_case` — `comment_tree`, `top_stories` |
| Go | `PascalCase` — `CommentTree`, `TopStories` |
| Rust | `snake_case` — `comment_tree`, `top_stories` |

## Docs changes

Doc-only PRs should:

- Use the `docs/*` branch prefix and `docs(...)` commit type.
- Not require test/lint runs if the diff is purely Markdown — but CI will still run verify.sh; no skip.
- Keep tone neutral and technical. Avoid marketing language.

## Pull-request process

1. Open the PR against `main`. Fill out the [PR template](./.github/pull_request_template.md).
2. Link related issues. Reference the design section if relevant (`DESIGN.md §3`).
3. CI runs automatically. All jobs must be green.
4. A maintainer reviews. Expect questions — they're in your favor.
5. Address feedback with follow-up commits (don't force-push during review so reviewers can see diffs).
6. Once approved and green, a maintainer merges via **Squash and merge** for feature branches (one Conventional Commit per PR lands on `main`).

## Release process

Maintainer-only. Reserved for v1.0+:

1. `scripts/bump-version.sh <new-version>` — propagates `VERSION` into every manifest.
2. Update `CHANGELOG.md` — move `[Unreleased]` entries under a new `[X.Y.Z] — YYYY-MM-DD` heading.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag: `git tag -s vX.Y.Z -m "Release X.Y.Z"`.
5. Push tag. GitHub Actions will run the full test matrix; after green, a future release workflow will publish to npm/PyPI/RubyGems/crates.io.

## Reporting security issues

**Please do not open public issues for security vulnerabilities.** Use [GitHub Security Advisories](https://github.com/hammadxcm/hacker-news-client/security/advisories/new) for private disclosure. Full policy: [`SECURITY.md`](./SECURITY.md).

## Maintainer notes

To receive private vulnerability reports, maintainers should enable the feature once per repository:

> Repo Settings → Code security and analysis → **Private vulnerability reporting** → Enable

No other repo-level configuration is required for the disclosure flow.

## License

By submitting a contribution, you agree that your work will be licensed under the [MIT License](./LICENSE) that covers this project.
