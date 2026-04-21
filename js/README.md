# hacker-news-client (JavaScript)

[![npm version](https://img.shields.io/npm/v/hacker-news-client.svg?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/hacker-news-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg?style=flat-square)](#tests)

Zero-dependency JavaScript client for the [Hacker News Firebase API](https://github.com/HackerNews/API). ESM-only, Node 20+, uses native `fetch`. Part of the [cross-language `hacker-news-client` suite](../README.md) — identical conceptual API across JS / TS / Python / Ruby / Go / Rust.

## Install

```bash
npm install hacker-news-client
```

## Usage

```js
import { HackerNewsClient } from 'hacker-news-client';

const client = new HackerNewsClient();

// Single item
const story = await client.item(1);
console.log(story?.title);

// Batch with bounded concurrency, order-preserving, fail-fast
const items = await client.items([1, 15, 100]);

// Top stories, hydrated (default limit 30)
const top = await client.topStories(10);

// Recursive comment tree with deleted-node pruning
const tree = await client.commentTree(8863);

// User profile
const user = await client.user('pg');
```

## Configuration

```js
new HackerNewsClient({
  baseUrl: 'https://hacker-news.firebaseio.com/v0', // default
  timeout: 10_000,                                   // total ms budget
  concurrency: 10,                                   // batch fan-out cap
  userAgent: 'my-app/1.0',                           // overrideable
  fetch: customFetch,                                // injectable for tests / middleware
});
```

## Error handling

Every error is a subclass of `HackerNewsError`:

```js
import {
  HackerNewsClient,
  HackerNewsError,
  TimeoutError,
  HttpError,
  JsonError,
  TransportError,
} from 'hacker-news-client';

try {
  await client.item(1);
} catch (err) {
  if (err instanceof HttpError) console.error(`HTTP ${err.status} at ${err.url}`);
  else if (err instanceof TimeoutError) console.error('timed out');
  else if (err instanceof TransportError) console.error('network failure', err.cause);
  else if (err instanceof JsonError) console.error('invalid JSON', err.cause);
  else if (err instanceof HackerNewsError) console.error('hn error', err);
}
```

`null` return from `item()` / `user()` means the API returned `null` — not an error. Deleted items (`{deleted: true}` stubs) also surface as `null`.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md) for the complete method surface. Naming follows JavaScript's `camelCase` convention:

| Method | Returns |
|---|---|
| `item(id)` | `Item \| null` |
| `items(ids)` | `Item[]` — order-preserving, nulls dropped |
| `user(username)` | `User \| null` |
| `maxItem()` | `number` |
| `updates()` | `{ items, profiles }` |
| `topStoryIds()` / `newStoryIds()` / `bestStoryIds()` / `askStoryIds()` / `showStoryIds()` / `jobStoryIds()` | `number[]` |
| `topStories(limit=30)` / ... | hydrated `Item[]` |
| `commentTree(id)` | `CommentTreeNode \| null` |

## Types

Items are plain JSON objects with a `type` discriminator. JSDoc `@typedef` declarations in [`src/client.js`](./src/client.js) document the union.

```js
// Narrow on `type`:
switch (item.type) {
  case 'story':   /* item.title, item.url, item.score, item.kids */ break;
  case 'comment': /* item.parent, item.text, item.kids */ break;
  case 'job':     /* item.title, item.url, item.text */ break;
  case 'poll':    /* item.title, item.parts, item.kids */ break;
  case 'pollopt': /* item.poll, item.score, item.text */ break;
}
```

For strict static typing, see the TypeScript sibling: [`@hacker-news/client-ts`](../ts/README.md).

## Tests

```bash
cd js
node --test test/*.test.js     # 37 tests: 16 integration + 21 unit
npm run lint                    # ESLint flat config
```

Coverage: 100% statements, branches, functions, and lines. Measured via `c8` at the monorepo root (`npm run coverage:js`).

## Example

[`example.js`](./example.js) hits the live HN API and prints the top five stories:

```bash
node example.js
```

## Links

- [Main repo README](../README.md) — project overview + feature matrix.
- [CHANGELOG](../CHANGELOG.md) — release notes.
- [CONTRIBUTING](../CONTRIBUTING.md) — how to contribute.
- [SECURITY](../SECURITY.md) — private vulnerability disclosure.
- [DESIGN.md](../DESIGN.md) — the cross-language contract.

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
