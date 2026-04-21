/**
 * Pure unit tests with mocked fetch — no network, no mock server subprocess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HackerNewsClient,
  HackerNewsError,
  HttpError,
  JsonError,
  TimeoutError,
  TransportError,
  type Item,
} from "../src/index.ts";

interface RouteSpec {
  status?: number;
  body?: unknown;
  delayMs?: number;
  throw?: Error;
}

function mockFetch(routes: Record<string, RouteSpec>): typeof fetch {
  return (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const u = typeof url === "string" ? new URL(url) : url;
    const spec = routes[u.pathname] ?? routes["*"] ?? { status: 404, body: null };
    if (spec.delayMs) await new Promise((r) => setTimeout(r, spec.delayMs));
    if (init?.signal?.aborted) {
      const err = new Error("aborted");
      (err as { name: string }).name = "AbortError";
      throw err;
    }
    if (spec.throw) throw spec.throw;
    return new Response(JSON.stringify(spec.body), {
      status: spec.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

const STORY_1 = {
  by: "pg",
  descendants: 3,
  id: 1,
  kids: [15],
  score: 57,
  time: 1160418111,
  title: "Y Combinator",
  type: "story" as const,
  url: "http://ycombinator.com",
};

test("constructor defaults", () => {
  const c = new HackerNewsClient();
  assert.equal(c.baseUrl, "https://hacker-news.firebaseio.com/v0");
  assert.equal(c.timeout, 10_000);
  assert.equal(c.concurrency, 10);
  assert.ok(c.userAgent.startsWith("hn-client-ts/"));
});

test("baseUrl trailing slash stripped", () => {
  const c = new HackerNewsClient({ baseUrl: "http://x/v0///" });
  assert.equal(c.baseUrl, "http://x/v0");
});

test("HN_BASE env override", () => {
  const prev = process.env.HN_BASE;
  process.env.HN_BASE = "http://env.test/v0";
  try {
    const c = new HackerNewsClient();
    assert.equal(c.baseUrl, "http://env.test/v0");
  } finally {
    if (prev === undefined) delete process.env.HN_BASE;
    else process.env.HN_BASE = prev;
  }
});

test("item decodes Story and narrows on type", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({ "/v0/item/1.json": { body: STORY_1 } }),
  });
  const item = await c.item(1);
  assert.ok(item);
  if (item.type === "story") assert.equal(item.title, "Y Combinator");
});

test("item null + deleted → null", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({
      "/v0/item/0.json": { body: null },
      "/v0/item/9.json": { body: { id: 9, type: "comment", deleted: true, time: 1 } },
    }),
  });
  assert.equal(await c.item(0), null);
  assert.equal(await c.item(9), null);
});

test("HttpError 500 and HackerNewsError base", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({ "/v0/item/1.json": { status: 500, body: null } }),
  });
  const err = (await c.item(1).catch((e) => e)) as HttpError;
  assert.ok(err instanceof HttpError);
  assert.ok(err instanceof HackerNewsError);
  assert.equal(err.status, 500);
});

test("HttpError 404", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({ "/v0/item/1.json": { status: 404, body: null } }),
  });
  const err = (await c.item(1).catch((e) => e)) as HttpError;
  assert.equal(err.status, 404);
});

test("TransportError carries cause", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch,
  });
  const err = (await c.item(1).catch((e) => e)) as TransportError;
  assert.ok(err instanceof TransportError);
  assert.equal((err.cause as Error).message, "ECONNREFUSED");
});

test("JsonError on invalid body", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: (async () =>
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof JsonError);
});

test("TimeoutError fires", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    timeout: 20,
    fetch: mockFetch({ "/v0/item/1.json": { delayMs: 100, body: STORY_1 } }),
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof TimeoutError);
});

test("AbortError from fetch re-throws reason", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: (async () => {
      const err = new Error("aborted");
      (err as { name: string }).name = "AbortError";
      throw err;
    }) as typeof fetch,
  });
  const err = await c.item(1).catch((e) => e);
  assert.ok(err instanceof Error);
});

test("items: preserve order, drop nulls", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    concurrency: 3,
    fetch: mockFetch({
      "/v0/item/1.json": { body: STORY_1 },
      "/v0/item/2.json": { body: null },
      "/v0/item/3.json": { body: { ...STORY_1, id: 3 } },
    }),
  });
  const out = await c.items([1, 2, 3]);
  assert.deepEqual(
    out.map((x: Item) => x.id),
    [1, 3],
  );
});

test("items([]) empty short-circuit", async () => {
  let calls = 0;
  const c = new HackerNewsClient({
    fetch: (async () => {
      calls++;
      return new Response("null");
    }) as typeof fetch,
  });
  assert.deepEqual(await c.items([]), []);
  assert.equal(calls, 0);
});

test("items fail-fast", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    concurrency: 2,
    fetch: mockFetch({
      "/v0/item/99.json": { status: 500, body: null },
      "*": { body: STORY_1 },
    }),
  });
  const err = await c.items([1, 99, 2, 3, 4]).catch((e) => e);
  assert.ok(err instanceof HttpError);
});

test("user decode + unknown", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({
      "/v0/user/pg.json": { body: { id: "pg", created: 1, karma: 100 } },
      "/v0/user/nobody.json": { body: null },
    }),
  });
  assert.equal((await c.user("pg"))?.id, "pg");
  assert.equal(await c.user("nobody"), null);
});

test("scalars + every story list + hydrate", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({
      "/v0/maxitem.json": { body: 123 },
      "/v0/updates.json": { body: { items: [1], profiles: ["pg"] } },
      "/v0/topstories.json": { body: [1] },
      "/v0/newstories.json": { body: [1] },
      "/v0/beststories.json": { body: [] },
      "/v0/askstories.json": { body: [] },
      "/v0/showstories.json": { body: [] },
      "/v0/jobstories.json": { body: [] },
      "/v0/item/1.json": { body: STORY_1 },
    }),
  });
  assert.equal(await c.maxItem(), 123);
  assert.deepEqual((await c.updates()).items, [1]);
  assert.deepEqual(await c.topStoryIds(), [1]);
  assert.deepEqual(await c.newStoryIds(), [1]);
  assert.deepEqual(await c.bestStoryIds(), []);
  assert.deepEqual(await c.askStoryIds(), []);
  assert.deepEqual(await c.showStoryIds(), []);
  assert.deepEqual(await c.jobStoryIds(), []);

  assert.equal((await c.topStories(5)).length, 1);
  assert.equal((await c.newStories(5)).length, 1);
  assert.deepEqual(await c.bestStories(5), []);
  assert.deepEqual(await c.askStories(5), []);
  assert.deepEqual(await c.showStories(5), []);
  assert.deepEqual(await c.jobStories(5), []);
});

test("commentTree prunes deleted/null kids", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    concurrency: 2,
    fetch: mockFetch({
      "/v0/item/100.json": {
        body: { id: 100, type: "comment", kids: [101, 102, 103], time: 1 },
      },
      "/v0/item/101.json": { body: { id: 101, type: "comment", time: 1 } },
      "/v0/item/102.json": { body: { id: 102, type: "comment", deleted: true, time: 1 } },
      "/v0/item/103.json": { body: null },
    }),
  });
  const root = await c.commentTree(100);
  assert.ok(root);
  assert.deepEqual(
    root.replies.map((r) => r.id),
    [101],
  );
});

test("commentTree null root → null", async () => {
  const c = new HackerNewsClient({
    baseUrl: "http://m/v0",
    fetch: mockFetch({ "/v0/item/999.json": { body: null } }),
  });
  assert.equal(await c.commentTree(999), null);
});
