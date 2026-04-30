#!/usr/bin/env bash
# scripts/bump-version.sh — propagate VERSION into every manifest.
# Usage: scripts/bump-version.sh 0.2.0
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <new-version>" >&2
  exit 1
fi
NEW="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "$NEW" > "$ROOT/VERSION"

# JS / TS
for pkg in "$ROOT/js/package.json" "$ROOT/ts/package.json"; do
  tmp=$(mktemp)
  sed -E "s/\"version\": \"[^\"]+\"/\"version\": \"$NEW\"/" "$pkg" > "$tmp" && mv "$tmp" "$pkg"
done

# Python
sed -i.bak -E "s/^version = \".*\"/version = \"$NEW\"/" "$ROOT/python/pyproject.toml" && rm "$ROOT/python/pyproject.toml.bak"

# Ruby
sed -i.bak -E "s/VERSION = '.*'/VERSION = '$NEW'/" "$ROOT/ruby/lib/hacker/news/version.rb" && rm "$ROOT/ruby/lib/hacker/news/version.rb.bak"

# Rust
sed -i.bak -E "s/^version = \".*\"/version = \"$NEW\"/" "$ROOT/rust/Cargo.toml" && rm "$ROOT/rust/Cargo.toml.bak"

# Go (no single version field; update doc note if one existed)

echo "bumped to $NEW across all manifests"
