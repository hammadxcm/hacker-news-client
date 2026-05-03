<div align="center">

# hacker-news-client

**One design contract. Six idiomatic libraries. Zero surprises.**

A production-quality client suite for the official [Hacker News Firebase API](https://github.com/HackerNews/API) — JavaScript, TypeScript, Python, Ruby, Go, and Rust — sharing one wire contract, one mock server, one fixture set, and one cross-language verification harness.

<br>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg?style=flat-square)](./CHANGELOG.md)
[![CI](https://img.shields.io/github/actions/workflow/status/hammadxcm/hacker-news-client/ci.yml?branch=main&style=flat-square&label=ci&logo=githubactions&logoColor=white)](https://github.com/hammadxcm/hacker-news-client/actions/workflows/ci.yml)
[![Lint](https://img.shields.io/github/actions/workflow/status/hammadxcm/hacker-news-client/lint.yml?branch=main&style=flat-square&label=lint&logo=eslint&logoColor=white)](https://github.com/hammadxcm/hacker-news-client/actions/workflows/lint.yml)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/hammadxcm/hacker-news-client/codeql.yml?branch=main&style=flat-square&label=codeql&logo=github)](https://github.com/hammadxcm/hacker-news-client/actions/workflows/codeql.yml)
[![Scorecard](https://img.shields.io/github/actions/workflow/status/hammadxcm/hacker-news-client/scorecard.yml?branch=main&style=flat-square&label=scorecard&logo=openssf&logoColor=white)](https://github.com/hammadxcm/hacker-news-client/actions/workflows/scorecard.yml)
[![Supply chain](https://img.shields.io/github/actions/workflow/status/hammadxcm/hacker-news-client/supply-chain.yml?branch=main&style=flat-square&label=supply-chain&logo=dependabot&logoColor=white)](https://github.com/hammadxcm/hacker-news-client/actions/workflows/supply-chain.yml)
[![Codecov](https://img.shields.io/codecov/c/github/hammadxcm/hacker-news-client?style=flat-square&logo=codecov&logoColor=white)](https://codecov.io/gh/hammadxcm/hacker-news-client)
[![Tests](https://img.shields.io/badge/tests-248%20passing-brightgreen.svg?style=flat-square&logo=pytest&logoColor=white)](./scripts/verify.sh)
[![Conventional Commits](https://img.shields.io/badge/Conventional_Commits-1.0.0-FE5196.svg?style=flat-square&logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)
[![Contributor Covenant](https://img.shields.io/badge/Contributor_Covenant-2.1-4baaaa.svg?style=flat-square)](./CODE_OF_CONDUCT.md)

<br>

[![Languages](https://skillicons.dev/icons?i=js,ts,py,ruby,go,rust&theme=dark)](./README.md#feature-matrix)

[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%E2%89%A53.10-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![Ruby](https://img.shields.io/badge/ruby-%E2%89%A53.1-CC342D?style=flat-square&logo=ruby&logoColor=white)](https://www.ruby-lang.org)
[![Go](https://img.shields.io/badge/go-%E2%89%A51.22-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![Rust](https://img.shields.io/badge/rust-2021-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)

<br>

[**Quick-start**](#quick-start) &nbsp;·&nbsp;
[**Architecture**](./docs/ARCHITECTURE.md) &nbsp;·&nbsp;
[**Design contract**](./DESIGN.md) &nbsp;·&nbsp;
[**Research**](./RESEARCH.md) &nbsp;·&nbsp;
[**Contribute**](./CONTRIBUTING.md) &nbsp;·&nbsp;
[**Changelog**](./CHANGELOG.md) &nbsp;·&nbsp;
[**Security**](./SECURITY.md)

</div>

<hr>

## Why this exists

- **Idiomatic, not uniform.** Every library feels native to its language — JS uses `fetch` + `AbortController`, Rust uses `tokio` + `reqwest`, Go uses `context.Context` + tagged interface, Python uses `@dataclass` + `match` — but they all implement the same conceptual API against the same wire protocol.
- **Zero runtime dependencies where the stdlib can do the job.** Only Rust ships dependencies (`tokio`, `reqwest`, `serde`, `thiserror`) because those are the de-facto ecosystem baseline.
- **Test-first, cross-language.** A shared Node-based mock server and fixture set drive byte-identical behavior checks across every library.

<hr>

## Table of contents

- [Feature matrix](#feature-matrix)
- [Quick-start](#quick-start)
- [Repository layout](#repository-layout)
- [Development](#development)
- [Coverage](#coverage)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [Community](#community)
- [License](#license)

<hr>

## Feature matrix

| Capability | JS | TS | Python | Go | Ruby | Rust |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Single-item fetch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Batch fetch with bounded concurrency, order-preserving | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Fail-fast on first batch error | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Discriminated / tagged item types | JSDoc | union | dataclass | interface | subclass | enum |
| All six `*_story_ids` + hydrated `*_stories(limit)` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Recursive `comment_tree` with deleted-node pruning | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| User profile fetch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `max_item`, `updates` (typed record) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 10s total timeout, budget enforced end-to-end | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Injectable transport for tests / middleware | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Doc comments on every public symbol | JSDoc | TSDoc | Google | godoc | YARD | rustdoc |
| Strict-mode linter | Biome | Biome | ruff | `go vet`+`gofmt` | RuboCop | clippy+fmt |

<hr>

## Quick-start

<details>
<summary><b>JavaScript (Node 20+)</b></summary>

```bash
npm install @hammadxcm/hn-api-client-js
```

```js
import { HackerNewsClient } from '@hammadxcm/hn-api-client-js';

const client = new HackerNewsClient();
const story = await client.item(1);
console.log(story?.title);

const top = await client.topStories(10);
const tree = await client.commentTree(8863);
```

More: [`js/README.md`](./js/README.md)

</details>

<details>
<summary><b>TypeScript (Node 22.6+, strict)</b></summary>

```bash
npm install @hammadxcm/hn-api-client-ts
```

```ts
import { HackerNewsClient, type Item } from '@hammadxcm/hn-api-client-ts';

const client = new HackerNewsClient();
const item = await client.item(1);
if (item?.type === 'story') {
  console.log(item.title, item.score);
}
```

More: [`ts/README.md`](./ts/README.md)

</details>

<details>
<summary><b>Python (3.10+)</b></summary>

```bash
pip install hn-api-client
```

```python
from hacker_news_client import HackerNewsClient, Story

client = HackerNewsClient()
item = client.item(1)

match item:
    case Story(title=t, by=b, score=s):
        print(f"{t} — {b} ({s})")
```

More: [`python/README.md`](./python/README.md)

</details>

<details>
<summary><b>Ruby (3.1+)</b></summary>

```bash
gem install hacker-news-client
```

```ruby
require 'hacker/news/client'

client = Hacker::News::Client.new
item = client.item(1)
puts item.title if item.is_a?(Hacker::News::Story)
```

More: [`ruby/README.md`](./ruby/README.md)

</details>

<details>
<summary><b>Go (1.22+)</b></summary>

```bash
go get github.com/hammadxcm/hacker-news-client/go
```

```go
import (
    "context"
    "fmt"
    hackernews "github.com/hammadxcm/hacker-news-client/go"
)

c := hackernews.New(hackernews.Options{})
item, err := c.Item(context.Background(), 1)
if err != nil { /* handle */ }
if s, ok := item.(hackernews.Story); ok {
    fmt.Println(s.Title)
}
```

More: [`go/README.md`](./go/README.md)

</details>

<details>
<summary><b>Rust (2021, tokio)</b></summary>

```bash
cargo add hacker-news-client
```

```rust
use hacker_news_client::{HackerNewsClient, Item, Options};

# #[tokio::main]
# async fn main() -> hacker_news_client::Result<()> {
let client = HackerNewsClient::new(Options::default())?;
if let Some(Item::Story(s)) = client.item(1).await? {
    println!("{}", s.title.unwrap_or_default());
}
# Ok(()) }
```

More: [`rust/README.md`](./rust/README.md)

</details>

<hr>

## Repository layout

```
hacker-news-client/
├── README.md            ← you are here
├── CONTRIBUTING.md      ← how to contribute
├── CODE_OF_CONDUCT.md   ← Contributor Covenant 2.1
├── SECURITY.md          ← vulnerability disclosure
├── CHANGELOG.md         ← versioned release notes
├── SUPPORT.md           ← where to get help
├── LICENSE              ← MIT
├── VERSION              ← single source of truth, "0.1.0"
├── RESEARCH.md          ← API reference + prior-art survey
├── DESIGN.md            ← locked cross-language contract
├── docs/
│   └── ARCHITECTURE.md  ← contributor-facing system overview
├── js/      → idiomatic ESM JavaScript client
├── ts/      → strict TypeScript client with tagged unions
├── python/  → stdlib + optional httpx async extra
├── ruby/    → stdlib Net::HTTP gem
├── go/      → stdlib net/http + context.Context
├── rust/    → tokio + reqwest + serde
├── test/    → shared mock server + JSON fixtures
│   ├── mock-server.js
│   └── fixtures/*.json
├── scripts/
│   ├── verify.sh        ← cross-language test matrix
│   └── bump-version.sh
└── .github/             ← CI workflows, issue/PR templates
```

<hr>

## Development

Two-command onboarding:

```bash
npm install            # installs husky + eslint + prettier + c8 at the root
npm test               # runs scripts/verify.sh — all six language suites
```

Per-language iteration:

```bash
npm run lint           # Biome, ruff, rubocop, go vet+gofmt, clippy, cargo fmt
npm run coverage       # generates coverage reports per language
node --test test/*.test.js                   # mock server only
cd js     && node --test test/*.test.js      # js unit + integration
cd python && python3 -m unittest discover    # python
cd ruby   && rake test                       # ruby
cd go     && go test ./...                   # go
cd rust   && cargo test                      # rust
```

A [Husky](https://github.com/typicode/husky) pre-commit hook runs [`lint-staged`](https://github.com/lint-staged/lint-staged) on touched files plus a mock-server smoke test. A pre-push hook runs the full cross-language verification harness.

<hr>

## Coverage

Measured per language in CI and locally via `npm run coverage`:

| Language | Line | Branch | Tool |
|---|:-:|:-:|---|
| JavaScript | 100% | 100% | [`c8`](https://github.com/bcoe/c8) |
| TypeScript | 100% | 100% | [`c8`](https://github.com/bcoe/c8) |
| Python | 100% | — | [`coverage.py`](https://coverage.readthedocs.io) |
| Go | 98.3% | — | `go test -cover` |
| Ruby | 100% | 96.96% | [SimpleCov](https://github.com/simplecov-ruby/simplecov) |
| Rust | 94.4% | — | [`cargo-llvm-cov`](https://github.com/taiki-e/cargo-llvm-cov) |

The sub-100% cells are language-tooling quirks: Go's coverage tracer doesn't track inlined no-op tag methods, and Rust has a few concurrency-race branches that aren't deterministically reachable from tests.

<hr>

## Quality and security tooling

Every PR runs through an extensive free-for-OSS tooling stack. Every tool below is free for open-source projects and requires no paid tier or secret.

| Tool | What it catches |
|---|---|
| **[Biome](https://biomejs.dev)** | JavaScript + TypeScript lint + format + import sorting (single Rust-based tool; 10–20× faster than ESLint+Prettier) |
| **ruff** | Python style + correctness (replaces flake8 / isort / pylint) |
| **mypy --strict** | Python static types |
| **RuboCop** | Ruby style + correctness |
| **go vet + gofmt** | Go style + correctness (stdlib) |
| **clippy + rustfmt** | Rust style + correctness |
| **markdownlint-cli2** | Documentation style |
| **actionlint** | GitHub Actions workflow correctness |
| **shellcheck** | Shell script bugs + portability |
| **editorconfig-checker** | Consistent line endings, indentation |
| **CodeQL** | Semantic security analysis (JS/TS/Python/Ruby/Go) |
| **OSSF Scorecard** | Open-source best-practices scoring |
| **Dependabot** | Weekly dependency updates across all ecosystems |
| **dependency-review-action** | Per-PR diff of new dependencies + CVEs |
| **gitleaks** | Secret scanning across full git history |
| **npm audit** | Node.js CVE scanning |
| **pip-audit** | Python CVE scanning (PyPA) |
| **bundler-audit** | Ruby CVE scanning (RubySec) |
| **govulncheck** | Go CVE scanning (official) |
| **cargo-audit** | Rust CVE scanning (RustSec) |
| **Codecov** | Per-language coverage upload + PR comments |
| **Husky + lint-staged** | Local pre-commit + pre-push gates |

All of these run automatically on every PR via the workflows under [`.github/workflows/`](./.github/workflows/).

<hr>

## Documentation

| Document | Audience | What it covers |
|---|---|---|
| [`README.md`](./README.md) | Everyone | Overview, quick-start, matrix |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Contributors | How the libraries are organized; how to add a method |
| [`DESIGN.md`](./DESIGN.md) | Implementers | Locked cross-language contract, type model, error mapping |
| [`RESEARCH.md`](./RESEARCH.md) | Reviewers | Evidence-backed HN API reference, prior-art survey |
| [`CHANGELOG.md`](./CHANGELOG.md) | Users | Versioned release notes (Keep a Changelog) |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Contributors | Dev setup, branching, commit convention, PR workflow |
| [`SECURITY.md`](./SECURITY.md) | Security researchers | Private vulnerability disclosure |

<hr>

## Roadmap

v1 is intentionally minimal. The following are reserved extension points (see `DESIGN.md` §10):

- **`client.search.*`** — [Algolia HN Search API](https://hn.algolia.com/api) wrapper (full-text, `/items/:id` single-call tree).
- **`client.updates.stream(...)`** — Firebase REST SSE for live `/updates` and `/maxitem`.
- **`client.updates.poll(...)`** — polling helper that matches the future stream API shape.
- **Retries / rate-limiting / caching middleware** — plugs into the already-exposed transport abstraction.
- **Publishing to registries** — automated releases via tagged commits.

Want to contribute one of these? See [CONTRIBUTING.md](./CONTRIBUTING.md).

<hr>

## Contributing

Contributions are welcome and deeply appreciated. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) — it covers dev setup, the monorepo workflow, the commit convention, and what to do when adding a new method (hint: it's six implementations at once).

By participating in this project you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

<hr>

## Security

If you've found a vulnerability, please **do not** open a public issue. Report privately via [GitHub Security Advisories](https://github.com/hammadxcm/hacker-news-client/security/advisories/new). Full policy: [SECURITY.md](./SECURITY.md).

<hr>

## Community

- **Discussions** — [GitHub Discussions](https://github.com/hammadxcm/hacker-news-client/discussions) for questions and ideas.
- **Issues** — [GitHub Issues](https://github.com/hammadxcm/hacker-news-client/issues) for bugs and feature requests.
- **Code of Conduct** — [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md).
- **Support** — see [SUPPORT.md](./SUPPORT.md) for the full guide to where-to-ask.

<hr>

## License

MIT © hacker-news-client contributors — see [LICENSE](./LICENSE).

<div align="center">

<br>

Built with care for every language on the list.

[![Made with](https://skillicons.dev/icons?i=js,ts,py,ruby,go,rust,nodejs,github&theme=dark)](./README.md)

</div>
