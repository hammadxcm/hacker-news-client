# Subsystem 3: JS Library — Implementation Plan

**Goal:** Zero-runtime-dep JavaScript client for Node 20+ (ESM) that passes all 14 contract tests against the mock server.

**Architecture:** `HackerNewsClient` class exporting every method named in DESIGN §3. Uses native `fetch`, `AbortController` for timeout + fail-fast cancellation, and an inline semaphore for bounded concurrency. Error classes in a small hierarchy (`HackerNewsError` base + `TimeoutError`, `HttpError`, `JsonError`, `TransportError`). JSDoc on every public symbol with at least one `@example`. ESLint + Prettier configs shipped; no runtime deps.

**Tech Stack:** Node 20+ ESM, native `fetch`, `node:test`, ESLint flat config, Prettier, JSDoc.

**Files:**
- Create: `js/package.json`, `js/eslint.config.js`, `js/.prettierrc.json`
- Create: `js/src/errors.js`, `js/src/client.js`, `js/src/index.js`
- Create: `js/test/client.test.js`
- Create: `js/example.js`

Task breakdown: errors → single-item fetch → batch + semaphore → user/scalars/lists → story hydration → comment tree → error paths → example → commit.
