# hacker-news-client (Rust)

[![Crates.io](https://img.shields.io/crates/v/hacker-news-client.svg?style=flat-square&logo=rust&logoColor=white)](https://crates.io/crates/hacker-news-client)
[![docs.rs](https://img.shields.io/docsrs/hacker-news-client?style=flat-square&logo=rust&logoColor=white)](https://docs.rs/hacker-news-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Rust](https://img.shields.io/badge/rust-2021-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Coverage](https://img.shields.io/badge/line--coverage-94.4%25-brightgreen.svg?style=flat-square)](#tests)

Async Rust client for the [Hacker News Firebase API](https://github.com/HackerNews/API). Built on `tokio` + `reqwest` + `serde` + `thiserror`. Tagged-enum `Item` type, typed error enum, bounded concurrency via `tokio::sync::Semaphore` + `JoinSet` with `abort_all()` for fail-fast batches. Part of the [cross-language `hacker-news-client` suite](../README.md).

## Install

```bash
cargo add hacker-news-client
```

Or add to `Cargo.toml`:

```toml
[dependencies]
hacker-news-client = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Usage

```rust
use hacker_news_client::{HackerNewsClient, Item, Options};

#[tokio::main]
async fn main() -> hacker_news_client::Result<()> {
    let client = HackerNewsClient::new(Options::default())?;

    // Single item, pattern-match on the tagged enum
    if let Some(Item::Story(s)) = client.item(1).await? {
        println!("{}", s.title.as_deref().unwrap_or(""));
    }

    // Batch — order-preserving, fail-fast
    let items = client.items(&[1, 15, 100]).await?;

    // Top stories, hydrated
    let top = client.top_stories(10).await?;

    // Recursive comment tree
    let tree = client.comment_tree(8863).await?;

    // User profile
    let user = client.user("pg").await?;

    Ok(())
}
```

## Configuration

```rust
use std::time::Duration;
use hacker_news_client::{HackerNewsClient, Options};

let client = HackerNewsClient::new(Options {
    base_url: "https://hacker-news.firebaseio.com/v0".to_string(),
    timeout: Duration::from_secs(10),
    concurrency: 10,
    user_agent: "my-app/1.0".to_string(),
})?;
```

Unit tests use [`mockito`](https://crates.io/crates/mockito) to stub the HTTP layer — see [`tests/unit.rs`](./tests/unit.rs).

## Error handling

```rust
use hacker_news_client::Error;

match client.item(1).await {
    Ok(Some(item)) => println!("{:?}", item),
    Ok(None) => println!("deleted or missing"),
    Err(Error::Http { status, url }) => eprintln!("HTTP {status} at {url}"),
    Err(Error::Timeout { url }) => eprintln!("timed out on {url}"),
    Err(Error::Transport(e)) => eprintln!("network: {e}"),
    Err(Error::Decode(e)) => eprintln!("decode: {e}"),
}
```

`Ok(None)` means the API returned `null` — not an error. Deleted stubs also collapse to `Ok(None)`.

## Item variants

```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
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

Each concrete struct has `BaseFields` (id, by, time, dead) flattened in plus variant-specific fields. See [`docs.rs`](https://docs.rs/hacker-news-client) for the full type reference.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md). Methods are `snake_case`, all `async`:

| Method | Returns |
|---|---|
| `item(id)` | `Result<Option<Item>>` — `Ok(None)` for null/deleted |
| `items(ids)` | `Result<Vec<Item>>` — order-preserving, nones dropped |
| `user(username)` | `Result<Option<User>>` |
| `max_item()` | `Result<u64>` |
| `updates()` | `Result<Updates>` |
| `top_story_ids()` / `new_story_ids()` / `best_story_ids()` / `ask_story_ids()` / `show_story_ids()` / `job_story_ids()` | `Result<Vec<u64>>` |
| `top_stories(limit)` / ... | `Result<Vec<Item>>` — hydrated |
| `comment_tree(id)` | `Result<Option<CommentTreeNode>>` |

## Tests

```bash
cd rust
cargo test                               # 43 tests: 16 integration + 27 unit
cargo test --doc                         # + 4 doc-tests
cargo clippy --all-targets -- -D warnings
cargo fmt --check

# Coverage (requires cargo-llvm-cov)
cargo install cargo-llvm-cov --locked
rustup component add llvm-tools-preview
cargo llvm-cov --tests --summary-only
```

Coverage: 94.4% lines / 98.15% functions — the remaining gap is a handful of concurrency-race branches not deterministically reachable.

The crate enforces `#![deny(missing_docs)]` — every public item has documentation.

## Example

[`examples/example.rs`](./examples/example.rs):

```bash
cargo run --example example
```

## Links

- [Main repo README](../README.md)
- [docs.rs](https://docs.rs/hacker-news-client)
- [CHANGELOG](../CHANGELOG.md)
- [CONTRIBUTING](../CONTRIBUTING.md)
- [DESIGN.md](../DESIGN.md)

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
