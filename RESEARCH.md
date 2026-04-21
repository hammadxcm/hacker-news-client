# RESEARCH.md — Hacker News API Client Suite

> Phase 1 deliverable. Evidence-backed findings that inform the cross-language contract in `DESIGN.md`. All live probes executed 2026-04-21 against `https://hacker-news.firebaseio.com/v0/`.

---

## 1. The Official HN API

### Transport & basics

- **Base URL**: `https://hacker-news.firebaseio.com/v0/`
- **Versioning**: path prefix `v0`. Per the README, only removal of a required field or an alteration counts as incompatible — clients **must gracefully ignore unknown fields**.
- **Auth**: none (public read-only dump).
- **Rate limit**: README states "There is currently no rate limit." No rate-limit headers returned.
- **Content type**: `application/json; charset=utf-8` on regular GETs; `text/event-stream` when the `Accept: text/event-stream` header is sent (Firebase REST streaming, live-verified 200 OK).
- **Optional query param**: `?print=pretty` for human-formatted JSON.
- **`null` semantics**: a GET to an item id that has no data returns the literal JSON `null` with HTTP status **200** (not 404). Verified: `/item/0.json` and `/item/99999999999.json` both return `200 null`. This is Firebase REST's standard "no value at path" behavior and is the **only** signal that an id is non-existent or fully scrubbed.

### Endpoint reference

| Endpoint | Returns | Cap | Notes |
|---|---|---|---|
| `/item/<id>.json` | Item object or `null` | — | Any `type`; see item schemas below. |
| `/user/<id>.json` | User object or `null` | — | Case-sensitive ids. Only users with public activity exist. |
| `/maxitem.json` | Integer | — | Current largest item id. Walk backward to enumerate. Streamable. |
| `/topstories.json` | Array of ids | **≤ 500** | Includes jobs. Live length: 500. |
| `/newstories.json` | Array of ids | ≤ 500 | Live length: 500. |
| `/beststories.json` | Array of ids | ≤ 500 per README; live length observed **200** | Treat as "up to 500" but plan for 200 in practice. |
| `/askstories.json` | Array of ids | **≤ 200** | Live length: 25 at test time. |
| `/showstories.json` | Array of ids | ≤ 200 | Live length: 117. |
| `/jobstories.json` | Array of ids | ≤ 200 | Live length: 31. |
| `/updates.json` | `{items: [ids], profiles: [usernames]}` | — | Recently-changed items and profiles. Streamable. |

### Item object — universal structure

Every item is served from the same endpoint, distinguished by a `type` string. Required fields per the README are only `id` (bolded) and `type` (implied — always present in live data). Everything else is conditional on `type` or state.

#### Common fields (all types)

| Field | Type | Required? | Notes |
|---|---|---|---|
| `id` | integer | Yes | Unique across all item types. |
| `type` | string enum | Yes (live) | `"job"` \| `"story"` \| `"comment"` \| `"poll"` \| `"pollopt"`. README doesn't bold it, but every live payload has it. |
| `by` | string | No | Author username. **Absent on deleted items.** |
| `time` | integer | No | Unix seconds. Present on every non-null item observed. |
| `deleted` | boolean | No | `true` only when set; absent otherwise. |
| `dead` | boolean | No | `true` when set. Dead items still return payload but with `text: "[dead]"`. |

#### `story`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `title` | string (HTML) | Yes | |
| `score` | integer | Yes | Net vote count. |
| `descendants` | integer | Yes | Total comment count; 0 if none. |
| `url` | string | Optional | Absent on text self-posts (e.g. id 121003). May also be empty string — treat as equivalent to absent. |
| `text` | string (HTML) | Optional | Present on text self-posts. |
| `kids` | array of ints | Optional | Top-level comment ids **in ranked display order**. Absent if no comments. |

Live anchor: item 1 — `{by:"pg", descendants:3, id:1, kids:[15,487171,234509,82729], score:57, time:1160418111, title:"Y Combinator", type:"story", url:"http://ycombinator.com"}`.

#### `comment`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `parent` | integer | Yes | Parent comment id or root story id. |
| `text` | string (HTML) | Yes (unless deleted or dead) | HTML-escaped. |
| `kids` | array of ints | Optional | Child comments in ranked order. |

No `title`, `score`, `url`, or `descendants`. Dead comments return `text:"[dead]"` with `dead:true`.

#### `job`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `title` | string | Yes | |
| `score` | integer | Yes | Jobs aren't voted on but carry a score (often 1). |
| `url` | string | Optional | Can be empty string (id 192327). |
| `text` | string (HTML) | Optional | Job description body. |

No `descendants`, no `kids` — jobs don't take comments.

#### `poll`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `title` | string | Yes | |
| `score` | integer | Yes | |
| `descendants` | integer | Yes | Comment count. |
| `parts` | array of ints | **Yes** | Ordered list of `pollopt` ids. **Poll-only.** |
| `text` | string | Optional | Poll prompt body; may be empty string. |
| `kids` | array of ints | Optional | Comments on the poll. |

Live anchor: item 126809 — `parts:[126810,126811,126812]`, 25 `kids`, `text:""`, `score:47`.

#### `pollopt`

| Field | Type | Required? | Notes |
|---|---|---|---|
| `poll` | integer | **Yes** | Id of the parent `poll`. **Pollopt-only.** |
| `score` | integer | Yes | Votes for this option. |
| `text` | string | Yes | The option text. |

No `title`, `url`, `kids`, `parts`, `descendants`, `parent`.

### Deleted items — two distinct mechanisms

1. **`deleted: true` tombstone** — item object is returned with just `id`, `type`, `time`, `deleted:true`, `parent` (for comments). No `by`, no `text`.
2. **Outright `null` body** — id resolves to nothing. HTTP 200 + body `null`. Returned for ids that never existed or have been hard-purged.

`dead:true` is **not deletion**: the item is hidden on the site but still fully returned with `dead:true` and `text:"[dead]"`.

### User object

Endpoint `/user/<id>.json`. Live probe of `pg`: keys = `['about','created','id','karma','submitted']`.

| Field | Type | Required? | Notes |
|---|---|---|---|
| `id` | string | **Yes** | Case-sensitive username. |
| `created` | integer | **Yes** | Unix seconds. |
| `karma` | integer | **Yes** | |
| `about` | string (HTML) | Optional | Self-description. |
| `submitted` | array of ints | Present on all active users | Submissions (stories, polls, comments). `pg` has 15 565 entries. Reverse-chronological in observed samples. |

Returns `null` for unknown / never-publicly-active usernames.

### Ordering notes

- `kids` — **ranked display order** (matches HN's thread rendering), not chronological. Clients that need chronological order must re-sort by `time`.
- `parts` — display order on the poll page.
- `{top,best,ask,show,job}stories` — HN's algorithmic ranking.
- `newstories` — reverse-chronological.
- `submitted` (user) — reverse-chronological in samples.

### Discrepancies between README and live data (locked in `DESIGN.md`)

1. README marks `topstories` as "up to 500" — live length exactly 500. **`beststories` grouped with top/new at 500 but live length is 200** — spec will tolerate either.
2. `type` is not bolded as required in the README field table but is present on every non-null live item. Treat as required for discrimination.
3. README does not document the `dead:true ⇒ text:"[dead]"` convention — confirmed live.
4. README makes no guarantee about absence vs. empty string for `url`. Live jobs have both patterns. Clients treat empty string and missing as equivalent.
5. Streaming is mentioned only through Firebase SDKs, but the raw REST `text/event-stream` path works from any HTTP/SSE client.
6. No `Content-Length`-based pagination on list endpoints — they always return the full array. Clients slice locally.
7. No rate-limit header — README's "no rate limit" is the only contract.

---

## 2. Related APIs — Scope Verdicts

### Algolia HN Search API — **OUT of v1**

Base: `https://hn.algolia.com/api/v1`. Endpoints: `/search`, `/search_by_date`, `/items/:id`, `/users/:username`.

- **Hit shape differs substantially from Firebase**: field renames (`by`→`author`, `time`→`created_at_i`, `score`→`points`, `descendants`→`num_comments`, `kids`→`children`), plus Algolia-only additions (`_highlightResult`, `_tags`, ISO `created_at`, `updated_at`).
- `/items/:id` delivers the full comment tree in one request (huge win vs. walking Firebase `kids`) but may lag Firebase by minutes to hours.
- No auth, no documented hard rate limit (community reports ~10 000 req/hour per IP).

**Why out:** a different API surface means a second type system, a second error model, and a second rate-limit story per language — roughly doubling v1's scope. Bundling both also muddies the mental model ("which one does this method hit?"). Reserved as `client.search.*` namespace in v2.

### Firebase REST streaming — **OUT of v1**

Protocol: `Accept: text/event-stream`. Server emits named SSE events: `put` (replace at `path`), `patch` (merge keys at `path`), `keep-alive` (ignore), `cancel` (rules blocked read), `auth_revoked`. **Clients must follow 307 redirects** (Firebase load-balances streams). Reconnect semantics are on the client.

Per-language reality:

| Language | SSE support |
|---|---|
| Browser JS | `EventSource` built-in — but cross-origin + header limitations bite authenticated streams. |
| Node JS | No stdlib `EventSource`; needs `undici` or `eventsource` npm + custom 307 handling. |
| Python | No stdlib SSE; `sseclient-py` or hand-roll over `requests` with `stream=True`. |
| Go | stdlib `net/http` gets close — read body line-by-line, parse `event:` / `data:` frames. ~150 LoC. |
| Ruby | No stdlib SSE; `ld-eventsource` gem or hand-roll over `Net::HTTP`. |
| Rust | `reqwest` + `eventsource-client` or `reqwest-eventsource`. |

**Why out:** six bespoke implementations for a flaky-network feature whose value (push latency) is mostly theoretical for library consumers. Most callers already poll `/maxitem` every 30–60 s, which is trivial in every language. Reserved as `client.updates.stream(...)` in v2.

### Polling helper — **OUT of v1** (user decision)

A `client.updates.poll({ interval })` wrapper is trivial per language but still v2 scope per project direction. Callers loop `max_item()` / `updates()` themselves.

### v2 extension hooks (reserved now)

- `client.search.*` — Algolia wrapper (distinct `SearchHit` type, not a Firebase item)
- `client.updates.stream(...)` — SSE async iterator / channel / block per language
- `client.updates.poll(...)` — polling helper
- Transport injection — the v1 client already exposes a `transport` / `http_client` parameter, so v2 retries / rate-limiting / observability plug in without breaking changes.

---

## 3. Prior-Art Survey

Sampled ~12 community clients across npm, PyPI, RubyGems, pkg.go.dev, crates.io. Representative findings below. Used only to inform design — no code copied.

### JavaScript / TypeScript

- **`node-hn-api`** (arjunsajeev, actively maintained) — modern TS wrapper on Firebase HN API, zero deps, native `fetch`.
  - Got right: full TS types, dual CJS/ESM, browser + Node, `camelCase`.
  - Awkward: single interface with optional fields for every variant — no tagged union.
  - Missing: `commentTree`, batch concurrency, Algolia, deleted-vs-missing distinction.
- **`hacker-news-api`** (fraction, abandoned 2014) — chainable Algolia wrapper, callback-based.
- **`cheeaun/node-hnapi`** (server, not a library) — pioneered "hydrated list" pattern worth borrowing.

### Python

- **`haxor`** (avinassh) — synchronous Firebase wrapper; snake_case; `expand=True` hydrates kids (the one real ergonomic win I saw).
  - Awkward: single `Item` class with `item_type` attr; no async support.
- **`hackernews-python` / `hackernews-client` / `HackerNewsAPI`** — all small, synchronous, single-class models.

### Ruby

- **`O-I/hn_api`** — idiomatic snake_case methods; returns `Hashie::Mash` (no typed value objects; typos are silent).
- **`bolthar/ruby-hackernews`** — scrapes HTML site via `mechanize`; historical curiosity, wrong approach.

### Go

- **`alexferrari88/GoHN`** (active) — go-github-inspired service-oriented client; `context.Context` on every call; configurable rate limiter; worker-pool `FetchAllDescendants` (~100× faster for comment trees).
  - Awkward: pointer fields (`*string`, `*int`) for every optional — verbose but idiomatic for JSON.
  - Missing: Algolia; no tagged item type.
- **`hermanschaaf/hackernews`** — minimal, context-aware, PascalCase. Clean but barebones.

### Rust

- **`hackernews-types` / `hacker-rs`** — the standout design. Serde-derived enum with five variants (`Story`, `Comment`, `Job`, `Poll`, `PollOpt`). This is *the* correct Rust shape — inform's our suite's item-modeling for every language.
- **`hnews`** — sync-only (ureq + miniserde); small-binary alternative, incompatible with tokio ecosystems.

### Cross-cutting observations (load-bearing for design)

1. **Item modeling**: only Rust's `hackernews-types` uses a tagged union. Every other client uses a bag-of-optionals. **Biggest design opportunity.**
2. **IDs vs. hydration**: nearly all expose only id lists. `GoHN` and `haxor` (`expand=True`) are the exceptions. We expose **both** `*_story_ids()` and `*_stories(limit)`.
3. **Comment trees**: only `GoHN` exposes a real recursive fetcher. **Differentiator.**
4. **Deleted items**: universally conflated with "not found". We honor the spec's null-collapse.
5. **Concurrency**: `GoHN` is the only client with a rate-limiter and worker pool. We default to bounded concurrency = 10.
6. **Algolia**: almost nobody wraps both in the same client. We keep them separate (Algolia reserved for v2).

---

## 4. Per-Language Idiom Cheat Sheet

### JavaScript (Node 20+, ESM)

- **Naming**: `camelCase` methods (`topStories`, `commentTree`).
- **Errors**: `Error` subclasses thrown; no `Result<T, E>` pattern.
- **Concurrency**: `Promise.all` + inline semaphore for caps.
- **HTTP**: native `fetch`; no `axios` / `node-fetch` dep.
- **Packaging**: `package.json` with `"type": "module"`, subpath `exports`, `engines.node >= 20`.
- **Testing**: `node:test` (stdlib).
- **Null**: `T | null` for deleted / missing; `T | undefined` for missing-optional. Keep distinct.

### TypeScript

- As JS plus: **tagged union** `type Item = Story | Comment | Job | Poll | PollOpt` with literal `type:` discriminator.
- `strict: true`, `noUncheckedIndexedAccess: true`.
- Ships `.d.ts` + ESM `.js` via `tsc` compile (no `tsx` runtime dep).

### Ruby (3.1+)

- **Naming**: `snake_case` methods, class per item variant (`HackerNews::Story < HackerNews::Item`), gem `hacker_news`.
- **Errors**: `HackerNews::Error < StandardError` with subclasses; raised, never returned.
- **Concurrency**: stdlib threads + `SizedQueue` for bounded fan-out. Avoid Async gem (runtime dep).
- **HTTP**: stdlib `Net::HTTP` via an injectable transport.
- **Packaging**: `hacker_news.gemspec`, `lib/hacker_news.rb`, `lib/hacker_news/version.rb`, `Rakefile`, `required_ruby_version >= 3.1`.
- **Testing**: `minitest` (stdlib).
- **Null**: `nil` for absent; `Deleted` not modeled as a variant (collapse to `nil` per spec).

### Python (3.10+)

- **Naming**: `snake_case` methods and modules; dist `hacker-news-client`, import `hacker_news_client`.
- **Errors**: `HackerNewsError(Exception)` base + subclasses; raised.
- **Item modeling**: `@dataclass(frozen=True)` per variant + `Item: TypeAlias = Story | Comment | Job | Poll | PollOpt`; callers use structural `match`.
- **Concurrency**: sync core uses `concurrent.futures.ThreadPoolExecutor`; optional `[async]` extra uses `httpx.AsyncClient` + `asyncio.Semaphore`.
- **HTTP**: stdlib `urllib.request` for sync; `httpx` for async extra.
- **Packaging**: `pyproject.toml` (PEP 621), hatchling backend, `requires-python = ">=3.10"`.
- **Testing**: `unittest` (stdlib).
- **Null**: `T | None` (PEP 604); full type hints; `py.typed` marker.

### Go (1.22+)

- **Naming**: `PascalCase` exported (`TopStories`, `CommentTree`); module path `github.com/<user>/hacker-news-client/go`.
- **Errors**: `(T, error)` returns; sentinel errors (`var ErrTimeout = errors.New(...)`) + typed errors (`*HTTPError`) checked via `errors.Is` / `errors.As`.
- **Item modeling**: `type Item interface { isItem() }` with private tag method; concrete structs implement it. **Custom `UnmarshalJSON` on `rawItem` peeks at `type` and dispatches.**
- **Concurrency**: `context.Context` first arg on every I/O method; channel-semaphore + `sync.WaitGroup` + context cancellation (no `golang.org/x/sync/errgroup` — stdlib only).
- **HTTP**: `net/http` with an injectable `*http.Client` on the client struct.
- **Packaging**: `go.mod`, `go 1.22+`, public API at package root, internals in `internal/`.
- **Testing**: stdlib `testing` + `httptest.Server`; table-driven tests.
- **Null**: pointers for genuinely optional fields; `Deleted` not modeled.

### Rust (2021, tokio)

- **Naming**: `snake_case` functions; crate `hacker-news-client`.
- **Errors**: `Result<T, Error>` with a `thiserror` enum — `Timeout`, `Http {status, url}`, `Decode(#[from] serde_json::Error)`, `Transport(#[from] reqwest::Error)`.
- **Item modeling**: `#[derive(Serialize, Deserialize)] #[serde(tag = "type", rename_all = "lowercase")] enum Item { Story(Story), Comment(Comment), Job(Job), Poll(Poll), #[serde(rename = "pollopt")] PollOpt(PollOpt) }`. Explicit `rename = "pollopt"` on `PollOpt` is defensive.
- **Concurrency**: `tokio` runtime; `tokio::task::JoinSet` with `tokio::sync::Semaphore`; fail-fast via `abort_all()` on first error.
- **HTTP**: `reqwest` with `rustls-tls` default features.
- **Packaging**: `Cargo.toml` with feature flags, `edition = "2021"`, documented MSRV.
- **Testing**: `#[tokio::test]`; integration tests in `tests/`, unit tests inline.
- **Null**: `Option<T>` universally; no `Deleted` variant.

---

## 5. Fixture Anchors

Live payloads captured 2026-04-21. These seed `test/fixtures/*.json` so all six language test suites verify identical behavior.

| Fixture | Purpose |
|---|---|
| `item-1.json` | Story (pg's "Y Combinator") — simple story with `kids`. |
| `item-121003.json` | Text self-post — story with `text` and no `url`. |
| `item-192327.json` | Job — job with `url:""`. |
| `item-126809.json` | Poll — has `parts: [126810, 126811, 126812]`. |
| `item-126810.json` | Pollopt — references `poll: 126809`. |
| `item-8000…8005.json` | Deterministic comment tree for `comment_tree(8000)` tests (8004 is a `{deleted:true}` stub — verifies prune). |
| `item-null.json` | Body is `null` — verifies null-return. |
| `item-dead.json` | `{dead:true, text:"[dead]"}` — verifies dead-not-deleted. |
| `user-pg.json` | Known user. |
| `user-nobody.json` | Body is `null` — unknown user. |
| `maxitem.json`, `updates.json` | Small endpoints. |
| `{top,new,best,ask,show,job}stories.json` | Story list arrays. |
| `inject/500/:id` | Always HTTP 500 — for error-propagation tests. |
| `inject/slow/:id` | 15 s delay — for timeout tests (client default is 10 s). |

---

## 6. Versioning & Release

- Single `VERSION` file at repo root, initially `0.1.0`.
- `scripts/bump-version.sh` propagates into each manifest: `js/package.json`, `ts/package.json`, `python/pyproject.toml`, `ruby/lib/hacker_news/version.rb`, `go/version.go`, `rust/Cargo.toml`.
- Lockstep across all six libraries. 1.0 cut only after `scripts/verify.sh` passes all six.
- Pre-1.0: any design change allowed; API not yet stable.
