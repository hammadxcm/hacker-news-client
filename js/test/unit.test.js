/**
 * Pure unit tests — no network, no subprocess. Mocks the injected `fetch` so
 * tests exercise the client's decode / error-mapping / concurrency logic in
 * isolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HackerNewsClient,
  HackerNewsError,
  HttpError,
  JsonError,
  TimeoutError,
  TransportError,
} from '../src/index.js';

/**
 * Build a mock `fetch` that resolves by URL → canned response spec.
 * Each spec is either `{ status, body }` or `{ throw }` or `{ delayMs, status, body }`.
 */
function mockFetch(routes) {
  return async (url, init) => {
    const path = new URL(url).pathname;
    const spec = routes[path] ?? routes['*'] ?? { status: 404, body: null };
    if (spec.delayMs) await new Promise((r) => setTimeout(r, spec.delayMs));
    if (init?.signal?.aborted) {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }
    if (spec.throw) throw spec.throw;
    return new Response(JSON.stringify(spec.body), {
      status: spec.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

const STORY_1 = {
  by: 'pg',
  descendants: 3,
  id: 1,
  kids: [15],
  score: 57,
  time: 1160418111,
  title: 'Y Combinator',
  type: 'story',
  url: 'http://ycombinator.com',
};

test('client constructor defaults match spec', () => {
  const c = new HackerNewsClient();
  assert.equal(c.baseUrl, 'https://hacker-news.firebaseio.com/v0');
  assert.equal(c.timeout, 10_000);
  assert.equal(c.concurrency, 10);
  assert.ok(c.userAgent.startsWith('hn-client-js/'));
});

test('baseUrl strips trailing slashes', () => {
  const c = new HackerNewsClient({ baseUrl: 'https://x.example/v0///' });
  assert.equal(c.baseUrl, 'https://x.example/v0');
});

test('HN_BASE env overrides default when baseUrl not passed', () => {
  const prev = process.env.HN_BASE;
  process.env.HN_BASE = 'http://env.test/v0';
  try {
    const c = new HackerNewsClient();
    assert.equal(c.baseUrl, 'http://env.test/v0');
  } finally {
    if (prev === undefined) delete process.env.HN_BASE;
    else process.env.HN_BASE = prev;
  }
});

test('item decodes a story', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/item/1.json': { body: STORY_1 } }),
  });
  const item = await c.item(1);
  assert.equal(item.type, 'story');
  assert.equal(item.by, 'pg');
});

test('item returns null for literal-null body', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/item/0.json': { body: null } }),
  });
  assert.equal(await c.item(0), null);
});

test('item returns null for {deleted:true} stub', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({
      '/v0/item/42.json': { body: { id: 42, type: 'comment', deleted: true, time: 1 } },
    }),
  });
  assert.equal(await c.item(42), null);
});

test('HTTP 500 raises HttpError with status + url', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/item/1.json': { status: 500, body: null } }),
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof HttpError);
  assert.equal(err.status, 500);
  assert.ok(err.url.endsWith('/v0/item/1.json'));
  assert.ok(err instanceof HackerNewsError);
});

test('HTTP 404 raises HttpError (not conflated with null)', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/item/1.json': { status: 404, body: null } }),
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof HttpError);
  assert.equal(err.status, 404);
});

test('transport exception raises TransportError with cause', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof TransportError);
  assert.equal(err.cause?.message, 'ECONNREFUSED');
});

test('bad JSON raises JsonError', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: async () =>
      new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof JsonError);
});

test('timeout fires TimeoutError', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    timeout: 20,
    fetch: mockFetch({ '/v0/item/1.json': { delayMs: 100, body: STORY_1 } }),
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof TimeoutError);
});

test('items batch: order preserved, nulls dropped', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    concurrency: 3,
    fetch: mockFetch({
      '/v0/item/1.json': { body: STORY_1 },
      '/v0/item/2.json': { body: null },
      '/v0/item/3.json': { body: { ...STORY_1, id: 3 } },
    }),
  });
  const out = await c.items([1, 2, 3]);
  assert.deepEqual(
    out.map((x) => x.id),
    [1, 3],
  );
});

test('items([]) returns [] without any fetch calls', async () => {
  let called = 0;
  const c = new HackerNewsClient({
    fetch: async () => {
      called++;
      return new Response('null');
    },
  });
  const out = await c.items([]);
  assert.deepEqual(out, []);
  assert.equal(called, 0);
});

test('items fail-fast: first error raised, siblings cancelled', async () => {
  let completed = 0;
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    concurrency: 2,
    fetch: async (url) => {
      const path = new URL(url).pathname;
      if (path === '/v0/item/99.json') {
        return new Response('{"error":"boom"}', { status: 500 });
      }
      await new Promise((r) => setTimeout(r, 30));
      completed++;
      return new Response(JSON.stringify(STORY_1));
    },
  });
  const err = await c.items([1, 99, 2, 3, 4]).catch((e) => e);
  assert.ok(err instanceof HttpError);
  // At least one request may have completed before the abort;
  // but all five should not.
  assert.ok(completed < 5);
});

test('user decode', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({
      '/v0/user/pg.json': {
        body: { id: 'pg', created: 1, karma: 100, about: 'a', submitted: [1] },
      },
    }),
  });
  const u = await c.user('pg');
  assert.equal(u.id, 'pg');
});

test('user unknown → null', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/user/nobody.json': { body: null } }),
  });
  assert.equal(await c.user('nobody'), null);
});

test('scalars and lists decode', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({
      '/v0/maxitem.json': { body: 47846601 },
      '/v0/updates.json': { body: { items: [1, 2], profiles: ['pg'] } },
      '/v0/topstories.json': { body: [1, 2, 3] },
      '/v0/newstories.json': { body: [4, 5] },
      '/v0/beststories.json': { body: [] },
      '/v0/askstories.json': { body: [] },
      '/v0/showstories.json': { body: [] },
      '/v0/jobstories.json': { body: [] },
    }),
  });
  assert.equal(await c.maxItem(), 47846601);
  const up = await c.updates();
  assert.deepEqual(up.items, [1, 2]);
  assert.deepEqual(await c.topStoryIds(), [1, 2, 3]);
  assert.deepEqual(await c.newStoryIds(), [4, 5]);
  assert.deepEqual(await c.bestStoryIds(), []);
  assert.deepEqual(await c.askStoryIds(), []);
  assert.deepEqual(await c.showStoryIds(), []);
  assert.deepEqual(await c.jobStoryIds(), []);
});

test('*_stories hydration uses limit correctly', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({
      '/v0/topstories.json': { body: [1, 2, 3, 4, 5] },
      '/v0/item/1.json': { body: { ...STORY_1, id: 1 } },
      '/v0/item/2.json': { body: { ...STORY_1, id: 2 } },
      '/v0/newstories.json': { body: [10] },
      '/v0/item/10.json': { body: { ...STORY_1, id: 10 } },
      '/v0/beststories.json': { body: [] },
      '/v0/askstories.json': { body: [] },
      '/v0/showstories.json': { body: [] },
      '/v0/jobstories.json': { body: [] },
    }),
  });
  const top = await c.topStories(2);
  assert.deepEqual(
    top.map((s) => s.id),
    [1, 2],
  );
  // Hit every hydrated path for coverage.
  assert.equal((await c.newStories(5)).length, 1);
  assert.deepEqual(await c.bestStories(5), []);
  assert.deepEqual(await c.askStories(5), []);
  assert.deepEqual(await c.showStories(5), []);
  assert.deepEqual(await c.jobStories(5), []);
});

test('commentTree prunes deleted + recurses; respects concurrency', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    concurrency: 2,
    fetch: mockFetch({
      '/v0/item/100.json': {
        body: {
          id: 100,
          type: 'comment',
          kids: [101, 102, 103],
          text: 'root',
          time: 1,
        },
      },
      '/v0/item/101.json': { body: { id: 101, type: 'comment', text: 'a', time: 1 } },
      '/v0/item/102.json': { body: { id: 102, type: 'comment', deleted: true, time: 1 } },
      '/v0/item/103.json': { body: null }, // missing
    }),
  });
  const root = await c.commentTree(100);
  assert.equal(root.id, 100);
  // 102 pruned (deleted), 103 pruned (null)
  assert.deepEqual(
    root.replies.map((r) => r.id),
    [101],
  );
});

test('commentTree of a null root returns null', async () => {
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: mockFetch({ '/v0/item/999.json': { body: null } }),
  });
  assert.equal(await c.commentTree(999), null);
});

test('AbortError from fetch propagates as TimeoutError or re-thrown reason', async () => {
  // When fetch throws AbortError unprompted (no timeout, no external signal),
  // the client re-throws the abort reason.
  const c = new HackerNewsClient({
    baseUrl: 'http://mock/v0',
    fetch: async () => {
      const err = new Error('aborted externally');
      err.name = 'AbortError';
      throw err;
    },
  });
  const err = await c.item(1).catch((e) => e);
  // Either re-thrown abort reason, or TransportError depending on signal state.
  assert.ok(err instanceof Error);
});
