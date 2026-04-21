import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer } from '../../test/mock-server.js';
import { HackerNewsClient, HttpError, type Item, TimeoutError } from '../src/index.ts';

let srv: { port: number; close: () => Promise<void> };
let client: HackerNewsClient;

before(async () => {
  process.env.MOCK_SLOW_MS = '100';
  srv = await startServer(0);
  client = new HackerNewsClient({ baseUrl: `http://localhost:${srv.port}/v0` });
});

after(async () => {
  await srv.close();
});

test('item(1) returns a story narrowed to the story variant', async () => {
  const item = await client.item(1);
  assert.ok(item);
  assert.equal(item.type, 'story');
  if (item.type === 'story') {
    assert.equal(item.by, 'pg');
    assert.equal(item.title, 'Y Combinator');
  }
});

test('item() for every variant', async () => {
  assert.equal((await client.item(8001))?.type, 'comment');
  assert.equal((await client.item(192327))?.type, 'job');
  assert.equal((await client.item(126809))?.type, 'poll');
  assert.equal((await client.item(126810))?.type, 'pollopt');
});

test('item() returns null for body-null', async () => {
  assert.equal(await client.item('null'), null);
});

test('item() returns null for {deleted:true}', async () => {
  assert.equal(await client.item(8004), null);
});

test('item() returns full item for {dead:true}', async () => {
  const item = await client.item('dead');
  assert.ok(item);
  assert.equal(item.dead, true);
});

test('items() order preserved, nulls dropped', async () => {
  const out = await client.items([1, 'null', 8001, 8004, 192327]);
  assert.deepEqual(
    out.map((x: Item) => x.id),
    [1, 8001, 192327],
  );
});

test('items() fail-fast on HTTP 500', async () => {
  await assert.rejects(() => client.items([1, 'inject-500-42', 8001]), HttpError);
});

test('user + unknown user', async () => {
  assert.equal((await client.user('pg'))?.id, 'pg');
  assert.equal(await client.user('nobody'), null);
});

test('maxItem + updates shape', async () => {
  assert.equal(typeof (await client.maxItem()), 'number');
  const up = await client.updates();
  assert.ok(Array.isArray(up.items));
  assert.ok(Array.isArray(up.profiles));
});

test('every *_story_ids returns array', async () => {
  assert.ok(Array.isArray(await client.topStoryIds()));
  assert.deepEqual(await client.showStoryIds(), []);
});

test('topStories(3) hydrates', async () => {
  const out = await client.topStories(3);
  assert.ok(out.length <= 3);
});

test('commentTree(8000) with 8004 pruned', async () => {
  const root = await client.commentTree(8000);
  assert.ok(root);
  assert.equal(root.replies.length, 2);
  const [c1, c2] = root.replies;
  assert.deepEqual(
    c1?.replies.map((r) => r.id),
    [8003],
  );
  assert.deepEqual(
    c2?.replies.map((r) => r.id),
    [8005],
  );
});

test('HTTP 500 propagates', async () => {
  await assert.rejects(() => client.item('inject-500-42'), HttpError);
});

test('timeout surfaces as TimeoutError', async () => {
  const fast = new HackerNewsClient({
    baseUrl: `http://localhost:${srv.port}/v0`,
    timeout: 30,
  });
  await assert.rejects(() => fast.item('slow1'), TimeoutError);
});

test('unknown path → HttpError 404', async () => {
  await assert.rejects(
    () => client.user('../nonexistent-endpoint'),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
});
