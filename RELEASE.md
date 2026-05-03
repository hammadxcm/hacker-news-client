# Release Guide

How to cut a new version of the cross-language Hacker News client suite.

The six libraries are versioned in **lockstep** — every release ships the same `vX.Y.Z` to all six registries. There is no per-language drift.

> **Default path:** automated via `.github/workflows/publish.yml` — push a `vX.Y.Z` tag and CI publishes everything in parallel. See [Automated release (recommended)](#automated-release-recommended).
>
> **Fallback path:** the manual per-language commands below also work if CI is broken or you need to re-publish a single language out of band. See [Manual publish — per language](#manual-publish--per-language).

---

## Registry map

Established at v0.1.0. These names are permanent; only the version changes for subsequent releases.

| Language | Registry | Published as | Project URL |
|---|---|---|---|
| Ruby | RubyGems | `hacker-news-client` | <https://rubygems.org/gems/hacker-news-client> |
| Python | PyPI | `hn-api-client` (dist) / `hacker_news_client` (import) | <https://pypi.org/project/hn-api-client/> |
| Rust | crates.io | `hacker-news-client` | <https://crates.io/crates/hacker-news-client> |
| JS | npm | `@hammadxcm/hn-api-client-js` | <https://www.npmjs.com/package/@hammadxcm/hn-api-client-js> |
| TS | npm | `@hammadxcm/hn-api-client-ts` | <https://www.npmjs.com/package/@hammadxcm/hn-api-client-ts> |
| Go | proxy.golang.org | `github.com/hammadxcm/hacker-news-client/go` | <https://pkg.go.dev/github.com/hammadxcm/hacker-news-client/go> |

The naming asymmetries are intentional. PyPI's similarity rule blocks `hacker-news-client` and `hn-client` (collide with existing `hackernews-client`/`hnclient`), and the unscoped `hacker-news-client` was already taken on npm. See `DESIGN.md` §6 for the audit trail.

---

## Automated release (recommended)

Once the [one-time CI setup](#one-time-cicd-setup) is done, every release is:

```bash
# 1. Clean main.
git checkout main && git pull

# 2. Bump the version everywhere.
scripts/bump-version.sh 0.2.0

# 3. Cross-language verification.
bash scripts/verify.sh
npm run lint

# 4. Update CHANGELOG.md — move [Unreleased] entries under
#    a new ## [0.2.0] — YYYY-MM-DD heading, add new
#    [Unreleased] above it, update the link refs at the bottom.

# 5. Commit, tag, push.
git add VERSION js/package.json ts/package.json \
        python/pyproject.toml ruby/lib/hacker/news/version.rb \
        rust/Cargo.toml CHANGELOG.md
git commit -m "release: v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin main v0.2.0
```

The `v0.2.0` tag push triggers `.github/workflows/publish.yml`, which:

1. Verifies the tag matches `VERSION` and that `CHANGELOG.md` has a `[0.2.0]` section.
2. Builds and publishes in **parallel**: RubyGems, PyPI, crates.io, npm (JS), npm (TS).
3. Auto-creates `go/v0.2.0` and warms `proxy.golang.org`.
4. Drafts a GitHub Release page from the `[0.2.0]` CHANGELOG section — review and click **Publish release** by hand.

If a single language fails, the others still succeed. Re-run that one job from the Actions UI, or use the [manual fallback below](#manual-publish--per-language).

---

## One-time CI/CD setup

Do these steps once before the first automated release. Skip if already done.

### 1. Generate scoped publish tokens at each registry

Use **the narrowest scope possible** and an expiration:

| Registry | Where | Scope to choose |
|---|---|---|
| RubyGems | <https://rubygems.org/profile/api_keys> | name `gha-publish`, scope **Push rubygem** only, narrow to gem `hacker-news-client` |
| PyPI | <https://pypi.org/manage/account/token/> | name `gha-publish`, scope **Project: hn-api-client** |
| crates.io | <https://crates.io/settings/tokens> | name `gha-publish`, scope **`publish-update`**, crate **`hacker-news-client`** only |
| npm | <https://www.npmjs.com/settings/hammadxcm/tokens> | **Granular Access Token**, packages **`@hammadxcm/*`**, **read+write**, expiration 90 days |

### 2. Create four GitHub environments with scoped secrets

At <https://github.com/hammadxcm/hacker-news-client/settings/environments> → **New environment** (×4):

| Environment | Secret name | Value |
|---|---|---|
| `release-rubygems` | `RUBYGEMS_API_KEY` | RubyGems token |
| `release-pypi` | `PYPI_API_TOKEN` | PyPI token |
| `release-crates` | `CARGO_REGISTRY_TOKEN` | crates.io token |
| `release-npm` | `NPM_TOKEN` | npm token |

Per-environment scoping means a leaked npm token cannot reach the PyPI one.

### 3. (Optional but recommended) Manual approval gate

Same environments page → for each, check **"Required reviewers"** and add yourself. Now any release pauses for a one-click approval before publishing — a final airbag in case a tag goes out by mistake.

### 4. (Future) Migrate to OIDC Trusted Publishing

The workflow already requests `id-token: write` so OIDC migration is a no-code change:

- **PyPI** — set up a Trusted Publisher at <https://pypi.org/manage/project/hn-api-client/settings/publishing/> matching repo `hammadxcm/hacker-news-client`, workflow `publish.yml`, environment `release-pypi`. Then delete the `password:` line from the workflow. **No PyPI token in GitHub secrets ever again.**
- **npm** — Trusted Publishing is in beta as of 2026-05; once GA you can drop `NPM_TOKEN` similarly. The `--provenance` flag is already on, writing SLSA attestations downstream `npm install`ers can verify with `npm audit signatures`.

That eliminates two of the four secrets.

---

## Manual publish — per language

Use this only if CI is broken or you need to re-publish a single language out of band. The automated workflow above is the default path.

### Pre-release checklist (manual mode)

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

### Per-language commands

Run **after** the manual pre-release checklist has tagged. Each block is independent; they can run in any order or in parallel.

#### Ruby — `cd ruby`

```bash
gem build hacker-news-client.gemspec
gem push hacker-news-client-0.2.0.gem
```

The gemspec sets `rubygems_mfa_required = true`, so `gem push` prompts for an MFA OTP from your authenticator app. Verify at <https://rubygems.org/gems/hacker-news-client>.

#### Python — `cd python`

```bash
rm -rf dist
python3 -m build                                   # produces sdist + wheel
python3 -m twine upload dist/hn_api_client-0.2.0*  # prompts for token if no ~/.pypirc
```

If `twine` isn't installed: `pip install build twine`. Verify at <https://pypi.org/project/hn-api-client/>.

#### Rust — `cd rust`

```bash
cargo publish
```

`cargo publish` does its own pre-flight build, package, and verify, then uploads. The token comes from `~/.cargo/credentials.toml` (set up via `cargo login`). Verify at <https://crates.io/crates/hacker-news-client> and <https://docs.rs/hacker-news-client>.

#### JS — `cd js`

```bash
npm publish      # publishConfig.access = "public" is set in package.json
```

The package is scoped (`@hammadxcm/...`), so the `--access public` flag is implicit through `publishConfig` in `package.json`. Verify at <https://www.npmjs.com/package/@hammadxcm/hn-api-client-js>.

#### TS — `cd ts`

```bash
npm run build    # tsc → dist/ (rewrites .ts imports to .js)
npm publish
```

The `dist/` build output is `.gitignore`d but produced fresh on each publish. The build requires `@types/node` at the monorepo root (already a devDependency); if you ever see `Cannot find type definition file for 'node'`, run `npm install` at the root first.

#### Go — `cd go`

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

For the **automated release path**, all credentials live as GitHub Secrets inside per-registry environments — see [One-time CI/CD setup](#one-time-cicd-setup) above. Developer machines do not need any registry credentials at all.

For the **manual fallback path**, each registry stores its credential locally:

| Registry | Where (local CLI) | Recommended scope |
|---|---|---|
| RubyGems | `~/.local/share/gem/credentials` (set by `gem signin`) | The `rubygems_mfa_required` metadata flag means MFA OTP is required at every push for human accounts. API keys with the `mfa` + `index_rubygems` scopes bypass the prompt — that's what CI uses. |
| PyPI | `~/.pypirc` or `TWINE_PASSWORD` env var | Project-scoped token for `hn-api-client` (<https://pypi.org/manage/account/token/>). |
| crates.io | `~/.cargo/credentials.toml` (set by `cargo login`) | Crate-scoped token for `hacker-news-client` with `publish-update` only (<https://crates.io/settings/tokens>). |
| npm | `~/.npmrc` (set by `npm login`) | Granular token, scoped to `@hammadxcm/*`, **read+write**, with expiration (<https://www.npmjs.com/settings/hammadxcm/tokens>). |

### Treating a leaked token as compromised

**Never paste a token into a chat, a commit, an issue, or a PR description.** If a token reaches any of those places — including this assistant's conversation history — assume it is compromised:

1. **Revoke immediately** at the registry's token page (links above).
2. **Generate a fresh, narrowly-scoped replacement** with an expiration.
3. **Update the corresponding GitHub Secret** (Settings → Environments → the right environment → update the secret value). The old workflow runs continue with the old (now-revoked) token; new runs pick up the new one automatically.

Why act fast: with a leaked publish token, an attacker can push a malicious `0.X.Y` version of any package you own. Downstream consumers running `pip install -U`, `bundle update`, `cargo update`, or `npm install` pull the poisoned version automatically. This is the supply-chain attack pattern behind event-stream (2018), ua-parser-js (2021), and many more.

---

## Yanking / unpublishing

All four token-protected registries support yanking a published version, but **none let you re-use the version number**. If `0.2.0` ships broken, the fix is to ship `0.2.1`, not to unpublish + reupload `0.2.0`.

| Registry | Command |
|---|---|
| RubyGems | `gem yank hacker-news-client -v 0.2.0` |
| PyPI | Use the web UI (<https://pypi.org/manage/project/hn-api-client/release/0.2.0/>) — `twine` has no yank command. |
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
