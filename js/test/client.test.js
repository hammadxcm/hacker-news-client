import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../test/mock-server.js';
import { HackerNewsClient, HttpError, TimeoutError } from '../src/index.js';

let srv;
let client;

before(async () => {
  process.env.MOCK_SLOW_MS = '100';
  srv = await startServer(0);
  client = new HackerNewsClient({ baseUrl: `http://localhost:${srv.port}/v0` });
});

after(async () => {
  await srv.close();
});

test('item(1) returns a story with expected fields', async () => {
  const item = await client.item(1);
  assert.equal(item.type, 'story');
  assert.equal(item.id, 1);
  assert.equal(item.by, 'pg');
});

test('item() for each variant', async () => {
  assert.equal((await client.item(8001)).type, 'comment');
  assert.equal((await client.item(192327)).type, 'job');
  assert.equal((await client.item(126809)).type, 'poll');
  assert.equal((await client.item(126810)).type, 'pollopt');
});

test('item() returns null for body-null', async () => {
  assert.equal(await client.item('null'), null);
});

test('item() returns null for {deleted:true} stub', async () => {
  assert.equal(await client.item(8004), null);
});

test('item() returns full item for {dead:true}', async () => {
  const item = await client.item('dead');
  assert.ok(item);
  assert.equal(item.dead, true);
  assert.equal(item.text, '[dead]');
});

test('items() preserves input order, drops nulls + deleted', async () => {
  const out = await client.items([1, 'null', 8001, 8004, 192327]);
  assert.deepEqual(
    out.map((x) => x.id),
    [1, 8001, 192327],
  );
});

test('items() fail-fast on HTTP 500 inside batch', async () => {
  await assert.rejects(() => client.items([1, 'inject-500-42', 8001]), HttpError);
});

test('items([]) returns []', async () => {
  assert.deepEqual(await client.items([]), []);
});

test('user(known) + user(nobody)', async () => {
  const pg = await client.user('pg');
  assert.equal(pg.id, 'pg');
  assert.equal(await client.user('nobody'), null);
});

test('maxItem and updates', async () => {
  const max = await client.maxItem();
  assert.equal(typeof max, 'number');
  const up = await client.updates();
  assert.ok(Array.isArray(up.items));
  assert.ok(Array.isArray(up.profiles));
});

test('every *_story_ids returns an array (incl. empty for show)', async () => {
  assert.ok(Array.isArray(await client.topStoryIds()));
  assert.ok(Array.isArray(await client.newStoryIds()));
  assert.ok(Array.isArray(await client.bestStoryIds()));
  assert.ok(Array.isArray(await client.askStoryIds()));
  assert.deepEqual(await client.showStoryIds(), []);
  assert.ok(Array.isArray(await client.jobStoryIds()));
});

test('*_stories(limit) hydrates bounded number of items', async () => {
  const top = await client.topStories(3);
  assert.ok(top.length <= 3);
  assert.ok(top.every((i) => typeof i.id === 'number'));
});

test('commentTree(8000) builds the expected tree with 8004 pruned', async () => {
  const root = await client.commentTree(8000);
  assert.equal(root.id, 8000);
  assert.equal(root.replies.length, 2);
  const [c1, c2] = root.replies;
  assert.equal(c1.id, 8001);
  // 8004 is {deleted:true} → pruned; only 8003 survives under 8001
  assert.deepEqual(
    c1.replies.map((r) => r.id),
    [8003],
  );
  assert.equal(c2.id, 8002);
  assert.deepEqual(
    c2.replies.map((r) => r.id),
    [8005],
  );
});

test('HTTP 500 propagates as HttpError', async () => {
  await assert.rejects(() => client.item('inject-500-42'), HttpError);
});

test('timeout surfaces as TimeoutError', async () => {
  const fastClient = new HackerNewsClient({
    baseUrl: `http://localhost:${srv.port}/v0`,
    timeout: 30,
  });
  await assert.rejects(() => fastClient.item('slow1'), TimeoutError);
});

test('unknown path surfaces as HttpError 404 (not null)', async () => {
  await assert.rejects(
    () => client.user('../nonexistent-endpoint'),
    (err) => err instanceof HttpError && err.status === 404,
  );
});
