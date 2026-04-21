# hacker-news-client

A cohesive, production-quality client suite for the official [Hacker News Firebase API](https://github.com/HackerNews/API) in **six languages** — sharing one design contract, one mock server, one fixture set, and one cross-language verification harness.

| Language | Runtime | Package | Tests | Tooling |
|---|---|---|---|---|
| JavaScript | Node 20+ ESM | `hacker-news-client` (npm) | ✅ 16 | ESLint · Prettier · JSDoc |
| TypeScript | Node 22.6+ ESM | `@hacker-news/client-ts` (npm) | ✅ 15 | strict · TSDoc |
| Python | 3.10+ | `hacker-news-client` (PyPI) | ✅ 16 | ruff · mypy · PEP 257 |
| Go | 1.22+ | `github.com/hammadkhan/hacker-news-client/go` | ✅ 16 | `go vet` · `gofmt` · godoc |
| Ruby | 3.1+ | `hacker_news_client` (RubyGems) | ✅ 16 | RuboCop · YARD |
| Rust | 2021 · tokio | `hacker-news-client` (crates.io) | ✅ 17 | clippy · rustfmt · rustdoc |

Plus **19** tests for the shared mock server itself.

## Feature Matrix

Every library implements the same conceptual API. Method naming per language (JS/TS `camelCase`, Ruby/Python `snake_case`, Go `PascalCase`, Rust `snake_case`).

| Capability | JS | TS | Python | Go | Ruby | Rust |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Single-item fetch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Batch fetch, bounded concurrency, order-preserving | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fail-fast batch on first error | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Discriminated-union / tagged item types | (JSDoc) | ✓ | ✓ | interface | subclasses | enum |
| All 6 `*_story_ids()` + hydrated `*_stories(limit)` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recursive `comment_tree` with deleted-node pruning | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| User profile fetch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `max_item`, `updates` (typed record) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Per-request 10s total timeout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Injectable transport | ✓ | ✓ | ✓ | ✓ | — | — |
| Full docs on every public symbol | JSDoc | TSDoc | Google-style | godoc | YARD | rustdoc |

## Quick-start

### JavaScript
```js
import { HackerNewsClient } from 'hacker-news-client';
const client = new HackerNewsClient();
const story = await client.item(1);
console.log(story?.title);
```

### TypeScript
```ts
import { HackerNewsClient } from '@hacker-news/client-ts';
const client = new HackerNewsClient();
const item = await client.item(1);
if (item?.type === 'story') console.log(item.title);
```

### Python
```python
from hacker_news_client import HackerNewsClient, Story
client = HackerNewsClient()
item = client.item(1)
match item:
    case Story(title=t, by=b): print(f"{t} — {b}")
```

### Go
```go
import hackernews "github.com/hammadkhan/hacker-news-client/go"

c := hackernews.New(hackernews.Options{})
item, _ := c.Item(ctx, 1)
if s, ok := item.(hackernews.Story); ok {
    fmt.Println(s.Title)
}
```

### Ruby
```ruby
require "hacker_news_client"
client = HackerNewsClient::Client.new
item = client.item(1)
puts item.title if item.is_a?(HackerNewsClient::Story)
```

### Rust
```rust
use hacker_news_client::{HackerNewsClient, Item, Options};
let client = HackerNewsClient::new(Options::default())?;
if let Some(Item::Story(s)) = client.item(1).await? {
    println!("{}", s.title.unwrap_or_default());
}
```

## Run the verification harness

```bash
./scripts/verify.sh
```

Runs every language's test suite sequentially against the shared mock server and prints a pass/fail matrix. This is the acceptance gate for the suite.

## v1 Scope

In v1: 6 libraries wrapping the Firebase `/v0/` endpoints with identical conceptual APIs.

Not in v1 (all reserved as v2 extension points — see [`DESIGN.md`](./DESIGN.md) §10):

- Algolia HN Search API wrapper
- Firebase REST streaming (`/updates`, `/maxitem` SSE)
- Polling helpers
- Retries / rate-limit / cache middleware
- CLI or web UI

## Documentation

- [`RESEARCH.md`](./RESEARCH.md) — API reference, endpoint behavior, prior-art survey
- [`DESIGN.md`](./DESIGN.md) — the cross-language contract every library implements
- [`docs/superpowers/plans/`](./docs/superpowers/plans/) — per-subsystem TDD implementation plans

## License

MIT. See [`LICENSE`](./LICENSE).
