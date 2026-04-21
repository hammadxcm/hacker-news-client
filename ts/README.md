# @hacker-news/client-ts (TypeScript)

[![npm version](https://img.shields.io/npm/v/%40hacker-news%2Fclient-ts.svg?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@hacker-news/client-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](../LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.6-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](./tsconfig.json)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg?style=flat-square)](#tests)

Strict-mode TypeScript client for the [Hacker News Firebase API](https://github.com/HackerNews/API). Discriminated-union `Item` types, typed errors, zero runtime dependencies. Part of the [cross-language `hacker-news-client` suite](../README.md).

## Install

```bash
npm install @hacker-news/client-ts
```

## Usage

```ts
import { HackerNewsClient, type Item, type Story } from '@hacker-news/client-ts';

const client = new HackerNewsClient();

const item = await client.item(1);
if (item?.type === 'story') {
  // item is narrowed to Story: item.title, item.url, item.score, ...
  console.log(item.title);
}

const top: Item[] = await client.topStories(10);
const tree = await client.commentTree(8863);
const user = await client.user('pg');
```

## Type model

The `Item` union is tagged by a literal `type` field — TypeScript narrows on it:

```ts
import type { Item, Story, Comment, Job, Poll, PollOpt } from '@hacker-news/client-ts';

function describe(item: Item): string {
  switch (item.type) {
    case 'story':   return `story: ${item.title}`;
    case 'comment': return `comment on ${item.parent}`;
    case 'job':     return `job: ${item.title}`;
    case 'poll':    return `poll with ${item.parts.length} options`;
    case 'pollopt': return `option for poll ${item.poll}`;
  }
}
```

All fields are `readonly` and all optional fields use `| undefined` (with `exactOptionalPropertyTypes: true` enabled).

## Configuration

```ts
new HackerNewsClient({
  baseUrl: 'https://hacker-news.firebaseio.com/v0',  // default
  timeout: 10_000,                                    // ms
  concurrency: 10,                                    // batch fan-out
  userAgent: 'my-app/1.0',
  fetch: customFetch,                                 // injectable typeof fetch
});
```

## Errors

Typed error hierarchy:

```ts
import {
  HackerNewsClient,
  HackerNewsError,
  TimeoutError,
  HttpError,
  JsonError,
  TransportError,
} from '@hacker-news/client-ts';

try {
  await client.item(1);
} catch (err) {
  if (err instanceof HttpError) {
    // err.status and err.url are typed.
  }
}
```

## Tests and dev

This package is developed directly from `.ts` sources using Node 22.6+'s
`--experimental-strip-types` flag. No `tsx` or `ts-node` runtime is required.

```bash
cd ts
npm test             # 33 tests: 15 integration + 18 unit
npm run build        # tsc → dist/
npm run lint         # ESLint + typescript-eslint
```

Coverage: 100% statements, branches, functions, and lines — measured via `c8`.

## Full API

See the [cross-language contract (DESIGN.md)](../DESIGN.md). Methods are `camelCase`, matching the JavaScript sibling.

## Example

[`example.ts`](./example.ts) hits the live HN API:

```bash
npm run example
# or
node --experimental-strip-types --disable-warning=ExperimentalWarning example.ts
```

## Links

- [Main repo README](../README.md)
- [CHANGELOG](../CHANGELOG.md)
- [CONTRIBUTING](../CONTRIBUTING.md)
- [DESIGN.md](../DESIGN.md) — the locked cross-language contract.

## License

MIT © hacker-news-client contributors. See [LICENSE](../LICENSE).
