import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './mock-server.js';

let srv;
let base;

before(async () => {
  // Use a very short slow-delay so the slow-inject test doesn't bog down the suite.
  process.env.MOCK_SLOW_MS = '50';
  srv = await startServer(0);
  base = `http://localhost:${srv.port}/v0`;
});

after(async () => {
  await srv.close();
});

test('item-1 returns a story with correct content-type', async () => {
  const res = await fetch(`${base}/item/1.json`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  const body = await res.json();
  assert.equal(body.id, 1);
  assert.equal(body.type, 'story');
  assert.equal(body.by, 'pg');
});

test('item-121003 is a text self-post without url', async () => {
  const body = await fetch(`${base}/item/121003.json`).then((r) => r.json());
  assert.equal(body.type, 'story');
  assert.equal(body.url, undefined);
  assert.ok(body.text);
});

test('item-192327 is a job with empty-string url', async () => {
  const body = await fetch(`${base}/item/192327.json`).then((r) => r.json());
  assert.equal(body.type, 'job');
  assert.equal(body.url, '');
});

test('item-126809 is a poll with parts', async () => {
  const body = await fetch(`${base}/item/126809.json`).then((r) => r.json());
  assert.equal(body.type, 'poll');
  assert.deepEqual(body.parts, [126810, 126811, 126812]);
});

test('item-126810 is a pollopt pointing at its poll', async () => {
  const body = await fetch(`${base}/item/126810.json`).then((r) => r.json());
  assert.equal(body.type, 'pollopt');
  assert.equal(body.poll, 126809);
});

test('item-null returns HTTP 200 with literal null body', async () => {
  const res = await fetch(`${base}/item/null.json`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body, null);
});

test('item-8004 is a deleted tombstone stub', async () => {
  const body = await fetch(`${base}/item/8004.json`).then((r) => r.json());
  assert.equal(body.deleted, true);
  assert.equal(body.by, undefined);
});

test('item-dead is a dead comment with text "[dead]"', async () => {
  const body = await fetch(`${base}/item/dead.json`).then((r) => r.json());
  assert.equal(body.dead, true);
  assert.equal(body.text, '[dead]');
});

test('user pg has expected fields', async () => {
  const body = await fetch(`${base}/user/pg.json`).then((r) => r.json());
  assert.equal(body.id, 'pg');
  assert.equal(typeof body.karma, 'number');
  assert.ok(Array.isArray(body.submitted));
});

test('user nobody returns null body', async () => {
  const body = await fetch(`${base}/user/nobody.json`).then((r) => r.json());
  assert.equal(body, null);
});

test('maxitem returns an integer', async () => {
  const body = await fetch(`${base}/maxitem.json`).then((r) => r.json());
  assert.equal(typeof body, 'number');
  assert.ok(Number.isInteger(body));
});

test('updates returns typed record shape', async () => {
  const body = await fetch(`${base}/updates.json`).then((r) => r.json());
  assert.ok(Array.isArray(body.items));
  assert.ok(Array.isArray(body.profiles));
});

test('every story list returns an array', async () => {
  for (const list of ['top', 'new', 'best', 'ask', 'show', 'job']) {
    const body = await fetch(`${base}/${list}stories.json`).then((r) => r.json());
    assert.ok(Array.isArray(body), `${list}stories should be array`);
  }
});

test('showstories is the empty-array edge case', async () => {
  const body = await fetch(`${base}/showstories.json`).then((r) => r.json());
  assert.deepEqual(body, []);
});

test('inject/500/:id returns HTTP 500', async () => {
  const res = await fetch(`${base}/inject/500/42.json`);
  assert.equal(res.status, 500);
});

test('inject/slow/:id delays before responding', async () => {
  const t0 = Date.now();
  const res = await fetch(`${base}/inject/slow/42.json`);
  const elapsed = Date.now() - t0;
  assert.equal(res.status, 200);
  assert.ok(elapsed >= 45, `expected >= 45ms delay, got ${elapsed}ms`);
});

test('unknown path returns 404', async () => {
  const res = await fetch(`${base}/nonsense`);
  assert.equal(res.status, 404);
});

test('20 concurrent fetches of item-1 all return correct body', async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () => fetch(`${base}/item/1.json`).then((r) => r.json())),
  );
  for (const body of results) {
    assert.equal(body.id, 1);
    assert.equal(body.by, 'pg');
  }
});

test('comment-tree fixtures expose the expected graph', async () => {
  const [root, c1, c2, c3, c4, c5] = await Promise.all(
    [8000, 8001, 8002, 8003, 8004, 8005].map((id) =>
      fetch(`${base}/item/${id}.json`).then((r) => r.json()),
    ),
  );
  assert.deepEqual(root.kids, [8001, 8002]);
  assert.deepEqual(c1.kids, [8003, 8004]);
  assert.deepEqual(c2.kids, [8005]);
  assert.equal(c3.parent, 8001);
  assert.equal(c4.deleted, true);
  assert.equal(c5.parent, 8002);
});
