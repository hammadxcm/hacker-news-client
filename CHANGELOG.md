# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

All six language libraries (JavaScript, TypeScript, Python, Ruby, Go, Rust)
are versioned in **lockstep** — the version number below applies to every
library in this repository simultaneously.

## [Unreleased]

### Changed (Ruby — BREAKING for pre-release consumers)

- **Ruby gem renamed `hacker_news_client` → `hacker_news`** and module renamed
  `HackerNewsClient` → `HackerNews`. Callsite goes from
  `HackerNewsClient::Client.new` → `HackerNews::Client.new`, aligning with
  industry-idiomatic Ruby gems (Faraday::Connection, Stripe::Customer,
  Aws::S3::Client). Eliminates the "Client" duplication.
  - Renamed files: `ruby/lib/hacker_news_client.rb` → `ruby/lib/hacker_news.rb`;
    directory `ruby/lib/hacker_news_client/` → `ruby/lib/hacker_news/`;
    gemspec `hacker_news_client.gemspec` → `hacker_news.gemspec`.
  - All sub-classes re-namespaced under `HackerNews::` — Story, Comment, Job,
    Poll, PollOpt, User, Updates, CommentTreeNode, Error (+ HttpError,
    JsonError, TimeoutError, TransportError), VERSION.
  - `scripts/bump-version.sh` updated to write into `ruby/lib/hacker_news/version.rb`.
  - Docs updated: ruby/README.md (including shields.io + rubygems.org badge
    URLs), root README.md Ruby quick-start, DESIGN.md §9, RESEARCH.md §4 + §6,
    CONTRIBUTING.md "adding a method" file list, docs/ARCHITECTURE.md table.
  - Gem was unpublished at v0.1.0; no backward-compat alias was added.

### Changed

- **JavaScript + TypeScript linting and formatting migrated from ESLint + Prettier
  to [Biome](https://biomejs.dev) v2.4.** Single Rust-based tool replaces
  `eslint`, `@eslint/js`, `@typescript-eslint/*`, `typescript-eslint`, and
  `prettier` — roughly 10× faster than the ESLint+Prettier pipeline, one
  `biome.json` config replaces five, and import sorting is now automatic
  (none before).
  - `biome.json` at repo root — recommended ruleset plus extra strict
    `correctness`/`style`/`suspicious`/`security` rules (`noUnusedImports`,
    `useImportType`/`useExportType`, `useNodejsImportProtocol`,
    `useTemplate`, `useOptionalChain`, `useConst`, `noDoubleEquals`).
  - Scripts: `lint:js` / `lint:ts` / `lint:web` / `lint:fix` / `format` /
    `ci:biome` now wrap Biome commands. `npm run lint` aggregate unchanged.
  - `.github/workflows/lint.yml` — two ESLint steps replaced with one
    `biome ci` step.
  - `lint-staged` — JS/TS + JSON/JSONC files now routed through Biome.
  - Removed: `js/eslint.config.js`, `ts/eslint.config.js`, `js/.prettierrc.json`,
    `.prettierignore`.
  - Removed from devDeps: `eslint`, `@eslint/js`, `@typescript-eslint/*`,
    `typescript-eslint`, `prettier` (~80 MB of `node_modules`).
  - Per-language linters unchanged: ruff (Python), RuboCop (Ruby),
    `go vet`+`gofmt` (Go), clippy+rustfmt (Rust).

### Added

- Professional open-source documentation set (`CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `AUTHORS.md`).
- Redesigned root `README.md` with hero block, shields.io badges, tech-icon
  grid (via [skillicons.dev](https://skillicons.dev)), collapsible
  per-language quick-starts, feature matrix, and coverage table.
- Per-language `README.md` files for registry-visible landing pages
  (`js/`, `ts/`, `python/`, `ruby/`, `go/`, `rust/`).
- `docs/ARCHITECTURE.md` — contributor-facing system overview distilled from
  `DESIGN.md`.
- `.github/` community-health scaffolding:
  - `CODEOWNERS`, `FUNDING.yml`, `dependabot.yml`
  - Pull-request template, issue forms for bug reports and feature requests
  - `workflows/ci.yml` — matrix CI running all six language test suites plus
    a final `verify.sh` integration job
  - `workflows/lint.yml` — aggregate `npm run lint` across all languages
  - `workflows/codeql.yml` — GitHub's managed security scan for JS/TS/Python/
    Ruby/Go
- Free-for-OSS security + quality tooling, no secrets required:
  - `workflows/scorecard.yml` — OSSF Scorecard, weekly.
  - `workflows/supply-chain.yml` — npm audit, pip-audit, bundler-audit,
    govulncheck, cargo-audit, and `dependency-review-action` on PRs.
  - `workflows/secret-scan.yml` — gitleaks on every PR + weekly.
  - `workflows/code-quality.yml` — actionlint, shellcheck, markdownlint-cli2,
    editorconfig-checker.
  - `workflows/coverage.yml` — uploads per-language coverage to
    [Codecov](https://codecov.io) (tokenless for public repos).
- `codecov.yml` and `.markdownlint-cli2.jsonc` configuration files.
- Repository ownership: GitHub user corrected from the guessed
  `@hammadkhan` to the actual `@hammadxcm` across all docs, CODEOWNERS,
  issue/PR templates, workflow badges, and the Go module path
  (`github.com/hammadxcm/hacker-news-client/go`).

## [0.1.0] — 2026-04-21

Initial public release. Six-language client suite for the Hacker News Firebase
API, sharing a single design contract, fixture set, and cross-language
verification harness.

### Added

#### Core client API (all six languages)

- `item(id)` — fetch a single item; `null` for deleted or unknown ids.
- `items(ids)` — batch fetch with bounded concurrency; order-preserving;
  fail-fast on first error.
- `user(username)` — fetch user profile; `null` for unknown.
- `max_item()` — current largest item id.
- `updates()` — recently-changed items and profiles as a typed record.
- Six story-list pairs: `{top,new,best,ask,show,job}_story_ids()` and
  hydrated `{top,new,best,ask,show,job}_stories(limit=30)`.
- `comment_tree(id)` — recursive fetch with deleted-node pruning and
  one-global-semaphore concurrency bounding.

#### Type model

- Five item variants (`story`, `comment`, `job`, `poll`, `pollopt`) modeled
  as tagged unions where the language supports it:
  - **TypeScript**: literal-tag discriminated union.
  - **Rust**: serde-tagged enum with explicit `rename = "pollopt"`.
  - **Python**: `@dataclass(frozen=True)` per variant with `Item: TypeAlias`.
  - **Ruby**: class-per-variant under `HackerNews::Item` with `from_hash`.
  - **Go**: sealed `Item` interface with custom `UnmarshalJSON` dispatcher.
  - **JavaScript**: plain objects with JSDoc `@typedef` union.

#### Error model

Uniform across all six languages with language-idiomatic surfaces:

- `HackerNewsError` base + `TimeoutError` / `HttpError` / `JsonError` /
  `TransportError` subclasses (JS/TS/Python/Ruby).
- `thiserror`-derived `Error` enum (Rust).
- Sentinel errors (`ErrTimeout`, `ErrTransport`, `ErrDecode`) + `*HTTPError`
  (Go).

#### Spec compliance

- 10-second total-budget timeout enforced end-to-end.
- Bounded concurrency default of 10 for batch methods.
- Injectable transport for JS/TS/Python/Ruby/Go for test mocking and future
  middleware (retries, rate-limit, caching).
- HTTP 200 + `null` body correctly distinguished from HTTP 4xx/5xx.
- `{deleted: true}` stubs collapse to `null` return.
- `{dead: true}` items returned as-is with the `dead` flag preserved.

#### Testing infrastructure

- Shared Node.js mock server (`test/mock-server.js`) serving 25 fixture
  files, plus `/inject/500/:id` and `/inject/slow/:id` hooks for error and
  timeout tests.
- 248 tests total — 99 integration (against the mock server) + 149 unit
  (with the HTTP transport mocked per-language).
- Coverage: 100% JS/TS/Python; 100% line Ruby (96.96% branch); 98.3% Go;
  94.4% lines / 98.15% functions Rust.
- `scripts/verify.sh` runs all six language test suites sequentially and
  reports a pass/fail matrix.
- `scripts/bump-version.sh` propagates `VERSION` across every manifest.

#### Tooling

- Monorepo `package.json` with workspaces for `js/` and `ts/`.
- Husky pre-commit hook (`lint-staged` + mock smoke test) and pre-push hook
  (full verification harness).
- Per-language linting: ESLint (flat config) + Prettier (JS/TS), ruff
  (Python), RuboCop (Ruby), `go vet` + `gofmt` (Go), `cargo clippy`
  - `cargo fmt` (Rust).
- Per-language doc comments: JSDoc, TSDoc, Google-style Python docstrings,
  YARD, godoc, rustdoc (`#![deny(missing_docs)]`).

### Not included (reserved for v2)

- Algolia HN Search API wrapper (`client.search.*`).
- Firebase REST streaming (`client.updates.stream(...)`).
- Polling helpers (`client.updates.poll(...)`).
- Retry, rate-limiting, caching middleware.
- Release automation and registry publishing.

[Unreleased]: https://github.com/hammadxcm/hacker-news-client/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hammadxcm/hacker-news-client/releases/tag/v0.1.0
