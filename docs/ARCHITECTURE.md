# Architecture

Contributor-facing overview of how `hacker-news-client` is organized. Pair this with [`DESIGN.md`](../DESIGN.md) (the formal contract) and [`RESEARCH.md`](../RESEARCH.md) (evidence-backed API reference).

## One contract, six implementations

The project is a **monorepo** of six language libraries that implement the same conceptual API against the Hacker News Firebase API. The contract lives in `DESIGN.md` — any change to the public surface must be made there first, then propagated to all six.

```
                           ┌─────────────────────────────┐
                           │ hacker-news.firebaseio.com  │
                           │   /v0/item/<id>.json        │
                           │   /v0/user/<name>.json      │
                           │   /v0/{top,new,best,ask,    │
                           │        show,job}stories.json│
                           │   /v0/maxitem.json          │
                           │   /v0/updates.json          │
                           └──────────────▲──────────────┘
                                          │ HTTPS GET
                                          │
       ┌──────────────┬──────────────┬────┴─────┬──────────────┬──────────────┐
       │              │              │          │              │              │
   ┌───┴───┐      ┌───┴───┐      ┌───┴───┐  ┌───┴───┐      ┌───┴───┐      ┌───┴───┐
   │  JS   │      │  TS   │      │Python │  │ Ruby  │      │  Go   │      │ Rust  │
   │fetch  │      │fetch  │      │urllib │  │Net    │      │net/   │      │tokio/ │
   │       │      │       │      │       │  │::HTTP │      │http   │      │reqwest│
   └───┬───┘      └───┬───┘      └───┬───┘  └───┬───┘      └───┬───┘      └───┬───┘
       │              │              │          │              │              │
       └──────────────┴──────────────┴────┬─────┴──────────────┴──────────────┘
                                          │
                                          │ identical wire calls,
                                          │ identical fixture set
                                          │
                            ┌─────────────▼─────────────┐
                            │  test/mock-server.js      │
                            │  test/fixtures/*.json     │
                            │  (Node stdlib http)       │
                            └───────────────────────────┘
```

Each library talks to either the live HN API or the shared Node mock server. Integration tests hit the mock. Unit tests mock the HTTP layer one level lower (per-language) for purity and speed.

## Per-library internal shape

Every library has the same four concerns, laid out in the language's idiomatic structure:

| Concern | JS / TS | Python | Ruby | Go | Rust |
|---|---|---|---|---|---|
| Types | `types.ts` / JSDoc | `types.py` | `items.rb` | `items.go` | `items.rs` |
| Errors | `errors.js` / `errors.ts` | `errors.py` | `errors.rb` | `errors.go` | `errors.rs` |
| Transport + client | `client.js` / `client.ts` | `client.py` | `client.rb` | `client.go` | `client.rs` |
| Public entry | `index.js` / `index.ts` | `__init__.py` | `hacker_news_client.rb` | (package root) | `lib.rs` |

### Why these four?

1. **Types** are the wire-shape. The `Item` sum type (tagged by a `type` string discriminator) is the load-bearing modeling decision — every library renders it in whatever way its type system supports (discriminated union in TS / Rust, subclass hierarchy in Ruby, `@dataclass` union in Python, sealed interface in Go, JSDoc union in JS).

2. **Errors** are uniform in semantics but idiomatic in surface: `HackerNewsError` + subclasses in JS/TS/Python/Ruby; sentinels + `*HTTPError` in Go; a `thiserror` enum in Rust.

3. **Transport + client** contains the HTTP layer and the high-level methods. The transport is **always injectable** (except in Rust, where `reqwest` is already abstracted) — this is how unit tests mock.

4. **Public entry** re-exports the public symbols.

## Data flow: a single `item(id)` call

```
caller  ──▶ client.item(id)
              │
              ▼
           build URL: baseUrl + /item/<id>.json
              │
              ▼
           HTTP GET via injected transport
           (set User-Agent, 10s timeout, follow redirects ≤ 5)
              │
              ├───▶ HTTP error ≥ 400  ──▶ HttpError
              ├───▶ timeout            ──▶ TimeoutError
              ├───▶ transport failure  ──▶ TransportError
              │
              ▼
           parse JSON
              │
              ├───▶ bad JSON           ──▶ JsonError
              │
              ▼
           check for null / deleted:
              body == null                 ──▶ return null
              body.deleted == true         ──▶ return null
              otherwise                    ──▶ deserialize per `type`
                                                └─▶ return Item variant
```

This flow is identical across all six languages. The only differences are idiomatic: async vs. sync, `Result<T,E>` vs. thrown exceptions, interface type-switch vs. pattern match.

## Concurrency strategy

Batch methods (`items()`, `*_stories()`, `comment_tree()`) all use **bounded concurrency** (default 10) with **fail-fast** semantics.

- **`items(ids)`** — fan-out N futures bounded by a semaphore / worker pool of size `concurrency`. On the first error, cancel siblings and raise. Survivors preserve input order; nulls and deleted stubs are dropped.

- **`comment_tree(id)`** — recursive fan-out where children are fetched in parallel. The semaphore is **global across the entire tree** (not per level) so a wide fan-out × deep tree doesn't blow up concurrency. Deleted nodes are pruned.

Implementation per language:

| Language | Primitive |
|---|---|
| JS / TS | `Promise.all` + inline counting-semaphore |
| Python | `concurrent.futures.ThreadPoolExecutor` + `as_completed` |
| Ruby | `Thread` + `Queue` + `SizedQueue` for sem |
| Go | channel-semaphore + `sync.WaitGroup` + `context.WithCancel` |
| Rust | `tokio::task::JoinSet` + `tokio::sync::Semaphore` |

## Tests: integration + unit

Every library has two test suites:

1. **Integration** (`test/test_client.*`): starts the shared Node mock server, points the client at `http://localhost:<port>/v0`, runs the full matrix of 14–16 behaviors. Confirms byte-identical wire behavior across all six languages.

2. **Unit** (`test/test_unit.*`, `tests/test_unit.py`, `tests/unit.rs`): mocks the HTTP transport directly (per-language mechanism). Exercises pure decode/error-mapping/concurrency logic without any network.

Both matter:

- Integration proves the wire contract is honored.
- Unit gives fast feedback (< 1s) and keeps coverage high for error paths.

## Fixture set

[`test/fixtures/`](../test/fixtures/) is the single source of truth for wire shapes. Every fixture is anchored to a real HN item (see `RESEARCH.md` §5), with a few synthetic ones for test edge cases:

| Fixture | Purpose |
|---|---|
| `item-1.json` | Real story (pg's "Y Combinator") |
| `item-121003.json` | Real self-post (no `url`, has `text`) |
| `item-192327.json` | Real job (`url:""`) |
| `item-126809.json` | Real poll (with `parts`) |
| `item-126810.json` | Real pollopt |
| `item-0.json`, `item-null.json`, `user-nobody.json` | Literal `null` body — deleted/unknown |
| `item-8000..8005.json` | Synthetic comment tree for recursive tests |
| `item-dead.json`, `item-9999.json` | `{dead: true}` item |

When adding a new method that requires new wire shapes, add the fixture **once** and all six test suites benefit.

## The mock server

[`test/mock-server.js`](../test/mock-server.js) is Node stdlib (`http` + `fs.promises`). It exposes the same paths as the real HN API, plus error-injection hooks:

- `/v0/item/<id>.json` → reads `test/fixtures/item-<id>.json`
- `/v0/user/<name>.json` → reads `test/fixtures/user-<name>.json`
- `/v0/{list}.json` → static fixture per list
- `/v0/inject/500/<id>.json` → always returns HTTP 500
- `/v0/inject/slow/<id>.json` → delays `MOCK_SLOW_MS` then serves item-1
- numeric aliases `/v0/item/99999999.json` (500) and `/v0/item/99999998.json` (slow) — usable from statically-typed languages where only integers fit

Configurable via `MOCK_PORT` (default 8787, `0` = any-free) and `MOCK_SLOW_MS` (default 200).

## Where to add a new method

Follow this ordered checklist. Use `item()` as the reference template throughout.

1. **Update `DESIGN.md` §3**. Add the method to the conceptual surface table.
2. **Add fixtures + mock routes** if the wire behavior is new.
3. **Implement across all six libraries** in consistent order — JS → TS → Python → Ruby → Go → Rust. Each implementation should mirror the JS one structurally (argument order, return shape).
4. **Add integration tests** for each language (in `test_client.*`).
5. **Add unit tests** with mocked transport (in `test_unit.*`).
6. **Run `npm run coverage`** and confirm no regression.
7. **Update documentation**: the root `README.md` feature matrix, per-language READMEs, and CHANGELOG under `[Unreleased]`.
8. **Submit one PR** with a `feat(<scope>):` or `feat(all):` commit touching all six languages. Don't split a conceptual method across multiple PRs.

## Version lockstep

The project ships all six libraries at the same version, always. A single `VERSION` file at the repo root is the source of truth; `scripts/bump-version.sh <new>` propagates it into every manifest.

This design assumes a conceptual change is a cross-language change. If someone contributes "better Ruby threads" without touching the other five, it ships as a `0.1.X` patch across all six — the Ruby perf improvement is real but the JS/Python/etc. libraries rev too. It's the simplest version strategy that matches the "single contract" invariant.

## See also

- [`DESIGN.md`](../DESIGN.md) — the formal contract. Read this before changing the public API.
- [`RESEARCH.md`](../RESEARCH.md) — evidence-backed HN API reference, prior-art survey, per-language idiom notes.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — PR workflow, commit convention, quality gates.
- [`scripts/verify.sh`](../scripts/verify.sh) — the cross-language acceptance gate.
