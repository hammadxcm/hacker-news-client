# DESIGN.md — Hacker News API Client Suite

> Phase 2 deliverable. The shared contract every language implementation must satisfy. Derived from `RESEARCH.md`. Language-agnostic vocabulary; idiomatic per-language spelling.

---

## 1. Principles

- **SOLID** — transport abstraction is injectable; narrow method surface; one responsibility per module (types / transport / client).
- **DRY** — this document is the single source of truth for the method surface, type shapes, and error model. Shared `test/fixtures/*.json` and one Node mock server drive every language's test suite. Wire field names are identical to HN's (`by`, `time`, `kids`, `descendants`, etc.) — no per-language renaming at the type layer.
- **KISS** — stdlib over deps. Sync-first where the language permits.
- **YAGNI** — v1 is a read-only wrapper with no retries, no cache, no rate-limit, no streaming, no search, no CLI, no publishing automation.
- **Secure by default** — TLS verification on; 10 s total timeout; redirect cap of 5; HTTPS only.
- **Doc-commented + linted** — every public symbol carries idiomatic doc comments with at least one `@example`; each library has a project-standard linter configured.

---

## 2. Client Construction

| Parameter | Default | Notes |
|---|---|---|
| `base_url` | `https://hacker-news.firebaseio.com/v0` | Override for testing against the mock server via `HN_BASE` env var in tests. |
| `timeout` | **10 s total** (connect + read + decode) | Per language, pin the HTTP-client flag combo that enforces a single total budget. |
| `concurrency` | 10 | Bounded fan-out for batch methods (`items`, `*_stories`, `comment_tree`). |
| `user_agent` | `hn-client-<lang>/<version>` | Overridable. |
| `transport` / `http_client` | stdlib default | **Injectable** — required by tests and the v2 extension point for retries/rate-limiting/observability. |
| `max_redirects` | 5 | Safety cap. |

### Id type per language

HN item ids are monotonic and currently ~47 M; use a future-proof integer type:

| Language | Id type | Rationale |
|---|---|---|
| JS / TS | `number` | Safe-integer range covers 2⁵³; doc the upper bound. |
| Python | `int` | Arbitrary precision. |
| Ruby | `Integer` | Arbitrary precision. |
| Go | `int64` | Signed is idiomatic for JSON; HN never returns negative ids. |
| Rust | `u64` | Unsigned matches semantics. |

---

## 3. Method Surface (Language-Agnostic)

Naming per language: JS/TS `camelCase` · Ruby/Python `snake_case` · Go `PascalCase` · Rust `snake_case`.

| Conceptual | Input | Output | Semantics |
|---|---|---|---|
| `item` | `id` | `Item \| null` | `null` for body-null OR `{deleted:true}` stub. `dead:true` returns the full item. HTTP ≥ 400 → error. |
| `items` | `ids[]` | `Item[]` — drops nulls and deleted; survivors **preserve relative input order** | **Fail-fast**: first HTTP / transport error cancels siblings and raises. Callers who want best-effort loop `item()` themselves. |
| `user` | `username` | `User \| null` | `null` for unknown. |
| `max_item` | — | integer | |
| `updates` | — | `Updates { items: int[], profiles: string[] }` — a **named record/struct type** in every language, not a bare map. | |
| `top_story_ids` / `new_story_ids` / `best_story_ids` / `ask_story_ids` / `show_story_ids` / `job_story_ids` | — | `int[]` | Empty array if list is empty — **never `null`**. |
| `top_stories(limit=30)` / `new_stories(limit=30)` / `best_stories(limit=30)` / `ask_stories(limit=30)` / `show_stories(limit=30)` / `job_stories(limit=30)` | `limit?` | Hydrated `Item[]` via `items()`, nulls dropped, order preserved, length ≤ limit | Default `limit = 30` (front-page size). Passing `limit` greater than the live cap silently truncates. |
| `comment_tree(id)` | `id` | Root `Comment` with `replies: Comment[]` | Recursive descent under **one global semaphore** (bounded by client's `concurrency`). Deleted nodes pruned. **Fail-fast**: any error propagates and the tree is not returned. |

### Spec-faithful clauses

- The `items()` null-dropping literally implements the spec quote: *"drop `null` results in `items()` but not in the raw `*_story_ids()` calls."*
- Partial-failure-in-batch is **fail-fast, uniformly** across all six languages. Rust overrides `JoinSet` default by `abort_all()` on first error; Go uses context cancellation; JS/TS abort siblings via `AbortController`; Python uses an internal cancellation flag on the thread pool; Ruby uses the same on its `SizedQueue` workers.
- `comment_tree` uses a **single global semaphore** spanning the whole tree recursion, not per-level. This prevents concurrency amplification (fan-out × depth).

---

## 4. Type Model — Tagged Variants

Five variants tagged by the wire `type` field: `story`, `comment`, `job`, `poll`, `pollopt`.

### Per-language rendering

**TypeScript**

```ts
export type Item = Story | Comment | Job | Poll | PollOpt;
export interface Story { type: 'story'; id: number; /* ... */ }
export interface Comment { type: 'comment'; id: number; /* ... */ }
// etc. — literal `type` field is the discriminator
```

Config: `strict: true`, `noUncheckedIndexedAccess: true`.

**Rust**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Story(Story),
    Comment(Comment),
    Job(Job),
    Poll(Poll),
    #[serde(rename = "pollopt")]
    PollOpt(PollOpt),
}
```

Explicit `#[serde(rename = "pollopt")]` is defensive — `rename_all = "lowercase"` happens to produce `pollopt` from `PollOpt`, but the behaviour depends on implementation details; the explicit rename is self-documenting.

**Python**

```python
@dataclass(frozen=True)
class Story:
    id: int
    type: Literal["story"]
    time: int
    # required-first, optional with defaults after:
    by: str | None = None
    title: str | None = None
    # ...

Item: TypeAlias = Story | Comment | Job | Poll | PollOpt
```

Callers use `match item: case Story(...):`.

**Ruby**

```ruby
module Hacker
  module News
    class Item
      def self.from_hash(h)
        case h[:type]
        when "story"   then Story.new(h)
        when "comment" then Comment.new(h)
        when "job"     then Job.new(h)
        when "poll"    then Poll.new(h)
        when "pollopt" then PollOpt.new(h)
        end
      end
    end
    class Story < Item; end
    # ...
  end
end
```

**Go**

```go
type Item interface{ isItem() }

type Story struct { ID int64 `json:"id"`; /* ... */ }
func (Story) isItem() {}
// etc.

// Custom decoder peeks at "type" and dispatches:
func unmarshalItem(data []byte) (Item, error) { /* ... */ }
```

The unexported `isItem()` tag method seals the interface. **Callers decode via the package's decoder, not directly via `json.Unmarshal`** — this is load-bearing; without the dispatcher, Go users cannot parse responses into the interface.

**JavaScript**
Plain objects with `type` discriminator. JSDoc `@typedef` documents the union for editor tooling.

### Deleted / dead handling

- `{deleted:true}` tombstone → **collapsed to `null` return** (spec-faithful; no sixth `Deleted` variant).
- `dead:true` → returned as-is (full item with `dead: true` and `text: "[dead]"`).

---

## 5. Error Model

One error class / enum per language carrying `status` (nullable when not an HTTP error), `url`, and `cause`.

| Language | Surface |
|---|---|
| JS / TS | `class HackerNewsError extends Error { status?; url; cause? }` + subclasses `TimeoutError`, `HttpError`, `JsonError`, `TransportError` |
| Ruby | `Hacker::News::Error < StandardError` + `Hacker::News::TimeoutError`, `Hacker::News::HttpError`, `Hacker::News::JsonError`, `Hacker::News::TransportError` |
| Python | `HackerNewsError(Exception)` + `TimeoutError(HackerNewsError)`, `HttpError`, `JsonError`, `TransportError` |
| Go | `var ErrTimeout = errors.New("hn: timeout")`, `var ErrDecode = errors.New("hn: decode")` + `type HTTPError struct { Status int; URL string }` — checked via `errors.Is` / `errors.As` |
| Rust | `#[derive(thiserror::Error)] pub enum Error { Timeout, Http { status: u16, url: String }, Decode(#[from] serde_json::Error), Transport(#[from] reqwest::Error) }` |

### Mapping

| Wire event | Client behavior |
|---|---|
| HTTP 200 + body `null` | **Return `null` (not an error)** — this is Firebase's "not found". |
| HTTP 200 + `{deleted:true}` | **Return `null`** — spec-faithful collapse. |
| HTTP 200 + `{dead:true, ...}` | Return full item. |
| HTTP ≥ 400 (including 404) | Raise `HttpError` / return `*HTTPError`. Firebase never returns 404 for missing ids; any 404 is a client bug (wrong path). |
| Connection / DNS / TLS failure | Raise `TransportError` / return `err`. |
| Timeout (total budget 10 s) | Raise `TimeoutError` / return `ErrTimeout`. |
| Malformed / truncated JSON | Raise `JsonError` / return `ErrDecode`. |

---

## 6. Non-Goals (v1)

Explicitly deferred — no design debt, just scope discipline.

- **Retries** — no automatic retry on 5xx or timeout. Callers loop themselves if they need it.
- **Caching** — none. HN already caches aggressively at the CDN layer.
- **Rate limiting** — none. HN declares "no rate limit"; callers add their own middleware if concerned.
- **Streaming (`text/event-stream`)** — no SSE consumer. Reserved as `client.updates.stream(...)` v2 surface.
- **Polling helpers** — no `updates.poll(...)`. Reserved v2.
- **Algolia HN Search** — no. Reserved as `client.search.*` namespace v2.
- **CLI** — none.
- **Web UI** — none.
- **Publishing automation** — manual `scripts/bump-version.sh` only; no CI release pipeline.
- **CI setup** — out of v1 scope.

---

## 7. Versioning

- Single source of truth: `VERSION` at repo root (initially `0.1.0`).
- `scripts/bump-version.sh` propagates into every manifest.
- All six libraries version in **lockstep** — same version string, same release moment.
- Pre-1.0 is unstable; 1.0 cut only after `scripts/verify.sh` green across all six.

---

## 8. Testing Contract

Every language implementation **must** pass these 14 tests against the shared mock server at `$HN_BASE`:

1. Fetch single of each variant: story, comment, job, poll, pollopt — assert decoded shape.
2. Fetch `item-null` id → `null` return.
3. Fetch `{deleted:true}` stub → `null` return.
4. Fetch `{dead:true}` item → full item with `dead = true`.
5. Batch fetch `[valid, null-id, valid, deleted-id]` → survivors only, relative order preserved.
6. Batch fetch with one `/inject/500/:id` → fail-fast error.
7. User fetch — known (`pg`) + unknown (`nobody`) → `null` for unknown.
8. `max_item()` returns the fixture integer; `updates()` returns the typed record.
9. Every `*_story_ids()` list — verify shape, verify empty-array case via a fixture.
10. `*_stories(limit=5)` hydration.
11. `comment_tree(8000)` → expected tree with deleted `8004` pruned.
12. HTTP 500 propagation via `/inject/500/:id`.
13. Timeout via `/inject/slow/:id` with a short client-timeout override.
14. Unknown path → HTTP 404 → error (confirms 404 is not conflated with body-null).

The mock server is the specification's reference implementation. If a library test passes the mock but a library bug diverges from real HN, the mock's fixtures were wrong — the fix is in fixtures, not in the client.

---

## 9. Directory Contract

```
/Users/hammadxcm/hacker-news-client/
├── RESEARCH.md / DESIGN.md / README.md / LICENSE / VERSION
├── .gitignore / .editorconfig
├── docs/superpowers/plans/            ← per-subsystem TDD plans
├── scripts/verify.sh, scripts/bump-version.sh
├── test/mock-server.js
├── test/fixtures/                     ← canonical JSON shared by all libraries
└── js/ ts/ python/ ruby/ go/ rust/    ← six libraries, each with src/, test/, example
```

### Lockfile policy

- Commit `go.sum` (Go convention for reproducible builds).
- Omit `package-lock.json`, `Gemfile.lock`, `Cargo.lock`, `poetry.lock`, `uv.lock` (library convention).
- Enforced by `.gitignore`.

### Package naming

| Registry | Name |
|---|---|
| npm (JS) | `@hammadxcm/hn-api-client-js`. Unscoped `hacker-news-client` was already taken on npm by an unrelated 2020 user package; the personal-scope name is the suite-aligned alternative. |
| npm (TS) | `@hammadxcm/hn-api-client-ts`. Same scoping rationale; the originally-planned `@hacker-news` org is unclaimed but creating it requires a manual web step, so the personal scope `@hammadxcm` is used. |
| PyPI | `hn-api-client` (dist) / `hacker_news_client` (import). PyPI's similarity rule blocks `hacker-news-client` and `hn-client` (collide with existing `hackernews-client` / `hnclient`); the suite-aligned `hn-api-client` is distinctive enough to pass. |
| RubyGems | `hacker-news-client` |
| crates.io | `hacker-news-client` |
| Go module | `github.com/<user>/hacker-news-client/go` (monorepo submodule) |

---

## 10. v2 Extension Points (Reserved Now)

These shapes are reserved at v1 API design time so v2 can add features purely additively:

- `client.search.query(...)`, `client.search.by_date(...)`, `client.search.item_tree(id)` — Algolia wrapper with distinct `SearchHit` type.
- `client.updates.stream(...)` — async iterator / channel / block per language, yielding typed `Update` events.
- `client.updates.poll({ interval })` — polling helper with same callback shape.
- `Transport` abstraction already exposed in v1 — retries / rate-limit / caching middleware plugs in via a user-supplied transport without changing the public API.

The v1 public surface is frozen at the shape above. Anything not listed is out-of-scope.
