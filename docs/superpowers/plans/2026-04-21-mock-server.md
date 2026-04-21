# Subsystem 1: Mock Server + Fixtures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a Node stdlib HTTP mock server at `test/mock-server.js` that serves every HN API endpoint from static fixtures, plus error-injection hooks (`/inject/500/:id`, `/inject/slow/:id`), so all six language libraries can be tested against identical wire behavior.

**Architecture:** Zero-dep Node 20+ ESM using `node:http` + `node:fs`. Dispatches on URL pattern → fixture file (or injected behavior). Always returns `Content-Type: application/json; charset=utf-8`. Port configurable via `MOCK_PORT` env var (default 8787) or any value passed to `startServer(port)`. Exports `startServer(port?)` returning `{ port, close() }`.

**Tech Stack:** Node 20+ ESM, `node:http`, `node:fs/promises`, `node:test`, `node:assert`.

---

## Task 1: Write all canonical fixtures

**Files:**
- Create: `test/fixtures/item-1.json`, `item-121003.json`, `item-192327.json`, `item-126809.json`, `item-126810.json`
- Create: `test/fixtures/item-{8000..8005}.json` (comment tree)
- Create: `test/fixtures/item-null.json`, `item-dead.json`
- Create: `test/fixtures/user-pg.json`, `user-nobody.json`
- Create: `test/fixtures/maxitem.json`, `updates.json`
- Create: `test/fixtures/{top,new,best,ask,show,job}stories.json`

- [ ] **Step 1: Write each fixture file** with the shapes locked in `RESEARCH.md` §1 + §5.
- [ ] **Step 2: No test yet — fixtures are data, validated by subsequent server tests.**

## Task 2: Mock server skeleton (serve single item fixture)

**Files:**
- Create: `test/mock-server.js`
- Create: `test/mock-server.test.js`

- [ ] Step 1: Write failing test that imports `startServer`, listens on port 0, fetches `/v0/item/1.json`, asserts `status=200`, `content-type` header, and decoded body id/type/by.
- [ ] Step 2: Run `node --test test/mock-server.test.js` → FAIL (module not found).
- [ ] Step 3: Write minimal `startServer` that dispatches `/v0/item/:id.json` to `fixtures/item-:id.json`, sets content-type, returns port + close.
- [ ] Step 4: Run → PASS.
- [ ] Step 5: Commit.

## Task 3: Null body fixture

- [ ] Test: `GET /v0/item/<null-id>.json` returns status 200 with body `null`.
- [ ] Impl: if fixture content is literally `null`, still serve with 200 + correct content-type.
- [ ] Commit.

## Task 4: User endpoint

- [ ] Test: `/v0/user/pg.json` → 200 with user shape; `/v0/user/nobody.json` → 200 + body `null`.
- [ ] Impl: add `/v0/user/:name.json` dispatch.
- [ ] Commit.

## Task 5: Scalar + record endpoints

- [ ] Test: `/v0/maxitem.json` → integer; `/v0/updates.json` → `{items, profiles}`.
- [ ] Impl: static file dispatch.
- [ ] Commit.

## Task 6: Story list endpoints

- [ ] Test: every `/v0/{top,new,best,ask,show,job}stories.json` returns an array.
- [ ] Impl: static file dispatch.
- [ ] Commit.

## Task 7: Error-injection hook — 500

- [ ] Test: `GET /v0/inject/500/42.json` returns status 500 with arbitrary body.
- [ ] Impl: pattern `/v0/inject/500/:id.json` → `res.statusCode = 500; res.end('{"error":"injected"}')`.
- [ ] Commit.

## Task 8: Error-injection hook — slow (timeout test)

- [ ] Test: `GET /v0/inject/slow/42.json` takes ≥ 200ms to respond (mock server delays intentionally). Use a short delay for fast tests; real client timeout test will use its own short `timeout` override.
- [ ] Impl: pattern `/v0/inject/slow/:id.json` → `setTimeout(() => { serve item-1 }, 200)`.
- [ ] Commit.

## Task 9: Unknown path → 404

- [ ] Test: `GET /v0/nonsense` returns 404.
- [ ] Impl: default branch `res.statusCode = 404; res.end()`.
- [ ] Commit.

## Task 10: Concurrent request safety

- [ ] Test: fire 20 parallel fetches of `/v0/item/1.json`, assert all 20 return the correct body.
- [ ] Impl: `node:http` is natively concurrent; assert the impl doesn't accidentally serialize.
- [ ] Commit.

## Task 11: CLI entry point

- [ ] Test: running `node test/mock-server.js` with `MOCK_PORT=0` prints the chosen port and listens until SIGINT.
- [ ] Impl: bottom-of-file `if (import.meta.url === ...)` guard that calls `startServer`, logs the port, and wires SIGINT/SIGTERM to `close()`.
- [ ] Commit.
