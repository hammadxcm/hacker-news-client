# Release Guide

How to cut a new version of the cross-language Hacker News client suite.

The six libraries are versioned in **lockstep** — every release ships the same `vX.Y.Z` to all six registries. There is no per-language drift.

> Audience: anyone with publish credentials for the six registries. The recipe below assumes you've already done the one-time auth setup at the bottom.

---

## Registry map

Established at v0.1.0. These names are permanent; only the version changes for subsequent releases.

| Language | Registry | Published as | Project URL |
|---|---|---|---|
| Ruby | RubyGems | `hacker-news-client` | https://rubygems.org/gems/hacker-news-client |
| Python | PyPI | `hn-api-client` (dist) / `hacker_news_client` (import) | https://pypi.org/project/hn-api-client/ |
| Rust | crates.io | `hacker-news-client` | https://crates.io/crates/hacker-news-client |
| JS | npm | `@hammadxcm/hn-api-client-js` | https://www.npmjs.com/package/@hammadxcm/hn-api-client-js |
| TS | npm | `@hammadxcm/hn-api-client-ts` | https://www.npmjs.com/package/@hammadxcm/hn-api-client-ts |
| Go | proxy.golang.org | `github.com/hammadxcm/hacker-news-client/go` | https://pkg.go.dev/github.com/hammadxcm/hacker-news-client/go |

The naming asymmetries are intentional. PyPI's similarity rule blocks `hacker-news-client` and `hn-client` (collide with existing `hackernews-client`/`hnclient`), and the unscoped `hacker-news-client` was already taken on npm. See `DESIGN.md` §6 for the audit trail.

---

## Pre-release checklist

Run from the repo root.

```bash
# 1. Make sure main is clean and up to date.
git checkout main && git pull

# 2. Bump the version everywhere — writes to VERSION,
#    js/package.json, ts/package.json, python/pyproject.toml,
#    ruby/lib/hacker/news/version.rb, rust/Cargo.toml.
scripts/bump-version.sh 0.2.0

# 3. Run the cross-language verify harness — runs every language's
#    test suite plus the integration matrix against the mock server.
bash scripts/verify.sh

# 4. Aggregate lint across all six languages.
npm run lint

# 5. Update CHANGELOG.md — move [Unreleased] entries under
#    a new ## [0.2.0] — YYYY-MM-DD heading, add new
#    [Unreleased] above it, update the link refs at the bottom.

# 6. Commit and tag.
git add VERSION js/package.json ts/package.json \
        python/pyproject.toml ruby/lib/hacker/news/version.rb \
        rust/Cargo.toml CHANGELOG.md
git commit -m "release: v0.2.0"
git tag -a v0.2.0     -m "v0.2.0"
git tag -a go/v0.2.0  -m "Go module v0.2.0"

# 7. Push code + both tags. The go/* tag is required for Go's
#    submodule path versioning.
git push origin main v0.2.0 go/v0.2.0
```

---

## Publish — per language

Run **after** the pre-release checklist has tagged. Each block is independent; they can run in any order or in parallel. None require approving the others to land.

### Ruby — `cd ruby`

```bash
gem build hacker-news-client.gemspec
gem push hacker-news-client-0.2.0.gem
```

The gemspec sets `rubygems_mfa_required = true`, so `gem push` prompts for an MFA OTP from your authenticator app. Verify at https://rubygems.org/gems/hacker-news-client.

### Python — `cd python`

```bash
rm -rf dist
python3 -m build                                   # produces sdist + wheel
python3 -m twine upload dist/hn_api_client-0.2.0*  # prompts for token if no ~/.pypirc
```

If `twine` isn't installed: `pip install build twine`. Verify at https://pypi.org/project/hn-api-client/.

### Rust — `cd rust`

```bash
cargo publish
```

`cargo publish` does its own pre-flight build, package, and verify, then uploads. The token comes from `~/.cargo/credentials.toml` (set up via `cargo login`). Verify at https://crates.io/crates/hacker-news-client and https://docs.rs/hacker-news-client.

### JS — `cd js`

```bash
npm publish      # publishConfig.access = "public" is set in package.json
```

The package is scoped (`@hammadxcm/...`), so the `--access public` flag is implicit through `publishConfig` in `package.json`. Verify at https://www.npmjs.com/package/@hammadxcm/hn-api-client-js.

### TS — `cd ts`

```bash
npm run build    # tsc → dist/ (rewrites .ts imports to .js)
npm publish
```

The `dist/` build output is `.gitignore`d but produced fresh on each publish. The build requires `@types/node` at the monorepo root (already a devDependency); if you ever see `Cannot find type definition file for 'node'`, run `npm install` at the root first.

### Go — `cd go`

Nothing to publish actively. Once `go/v0.2.0` is tagged on `main` (step 7 above), `proxy.golang.org` will serve the new version on first request:

```bash
# Optional — warms the proxy and triggers pkg.go.dev indexing immediately.
curl -sL "https://proxy.golang.org/github.com/hammadxcm/hacker-news-client/go/@v/v0.2.0.info"
```

`pkg.go.dev` typically picks up the new version within ~5–10 minutes after the proxy request.

---

## Smoke test the published artifacts

Install each from the live registry into a clean working directory and call `client.item(1)` against the live HN API. Confirm you see `Y Combinator` by `pg`.

```bash
# Ruby
mkdir -p /tmp/smoke-rb && cd /tmp/smoke-rb
gem install hacker-news-client -v 0.2.0 --no-document
ruby -e "require 'hacker/news/client'; puts Hacker::News::Client.new.item(1).title"

# Python
python3 -m venv /tmp/smoke-py --clear && source /tmp/smoke-py/bin/activate
pip install --upgrade hn-api-client==0.2.0
python -c "from hacker_news_client import HackerNewsClient; print(HackerNewsClient().item(1).title)"

# Rust
mkdir -p /tmp/smoke-rs && cd /tmp/smoke-rs
cargo init --name smoke
cargo add hacker-news-client@0.2.0 tokio --features tokio/full
# … then write a tiny main.rs that calls client.item(1) and `cargo run`.

# JS
mkdir -p /tmp/smoke-js && cd /tmp/smoke-js
npm init -y && npm pkg set type=module
npm install @hammadxcm/hn-api-client-js@0.2.0
node --input-type=module -e "import {HackerNewsClient} from '@hammadxcm/hn-api-client-js'; const c=new HackerNewsClient(); console.log((await c.item(1)).title)"

# TS — same as JS, swap the package name to @hammadxcm/hn-api-client-ts.

# Go
mkdir -p /tmp/smoke-go && cd /tmp/smoke-go
go mod init smoke
go get github.com/hammadxcm/hacker-news-client/go@v0.2.0
# … then write a tiny main.go and `go run main.go`.
```

A more thorough smoke harness lives in the conversation history at `/tmp/hn-{rb,py,rs,npm,go}-smoke/` — exercises every public symbol, item variant, batch, comment tree, and error path. Recreate when needed.

---

## Tags

Two tag families per release:

| Tag | Purpose |
|---|---|
| `vX.Y.Z` | Repo-wide version. Read by humans and by GitHub's release UI. |
| `go/vX.Y.Z` | Required by Go's module-versioning rule for submodule paths. The Go module lives at `github.com/hammadxcm/hacker-news-client/go` (a subdirectory), and `proxy.golang.org` only treats the `go/`-prefixed tag as the canonical Go version. |

Both must point at the same commit. They are pushed together in step 7 of the checklist.

---

## Token management

Each registry needs a different credential. Best practice is per-registry tokens with **the narrowest scope possible** and an expiration date.

| Registry | Where | Recommended scope |
|---|---|---|
| RubyGems | `~/.local/share/gem/credentials` (set by `gem signin`) | The `rubygems_mfa_required` metadata flag means MFA OTP is required at every push — no scoped tokens needed. |
| PyPI | `~/.pypirc` or `TWINE_PASSWORD` env var | Project-scoped token for `hn-api-client` (created at https://pypi.org/manage/account/token/ after first publish). |
| crates.io | `~/.cargo/credentials.toml` (set by `cargo login`) | Crate-scoped token for `hacker-news-client` with `publish-update` only (created at https://crates.io/settings/tokens). |
| npm | `~/.npmrc` (set by `npm login`) | Granular token, scoped to `@hammadxcm/*`, **read+write** on existing packages, with expiration (created at https://www.npmjs.com/settings/hammadxcm/tokens). |

Never paste tokens into a chat or commit them. If you do leak one, revoke it immediately at the registry's token page and issue a new one.

---

## Yanking / unpublishing

All four token-protected registries support yanking a published version, but **none let you re-use the version number**. If `0.2.0` ships broken, the fix is to ship `0.2.1`, not to unpublish + reupload `0.2.0`.

| Registry | Command |
|---|---|
| RubyGems | `gem yank hacker-news-client -v 0.2.0` |
| PyPI | Use the web UI (https://pypi.org/manage/project/hn-api-client/release/0.2.0/) — `twine` has no yank command. |
| crates.io | `cargo yank --version 0.2.0 hacker-news-client` |
| npm | `npm unpublish @hammadxcm/hn-api-client-js@0.2.0` (only works within 72h of publish; after that, contact npm support). |
| Go | Delete the `go/v0.2.0` tag locally + remotely. The proxy retains the cached version forever — yanking is impossible after `proxy.golang.org` has served it once. |

---

## Audit trail of decisions

- **Ruby gem name** went from `hacker_news_client` → `hacker_news` → `hacker-news-client` over three commits before v0.1.0; the final dashed name follows the strict bundle-gem layout (`lib/hacker/news/client.rb`, module `Hacker::News::Client`).
- **Python dist name** is `hn-api-client` because PyPI's name-similarity rule blocks `hacker-news-client` and `hn-client`. The import name (`hacker_news_client`) is independent of the dist name.
- **npm packages** are scoped under `@hammadxcm` because `hacker-news-client` was already taken on npm and creating the `@hacker-news` org requires manual web setup that wasn't worth blocking on.
- **Rust + Ruby + Go** got the suite-preferred `hacker-news-client` name unchanged.

These constraints will not change for 1.x. If a 2.x rebrand becomes necessary, plan a coordinated rename across all six registries.
