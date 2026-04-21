import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIX_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const JSON_CT = 'application/json; charset=utf-8';

const STATIC = {
  '/v0/maxitem.json': 'maxitem.json',
  '/v0/updates.json': 'updates.json',
  '/v0/topstories.json': 'topstories.json',
  '/v0/newstories.json': 'newstories.json',
  '/v0/beststories.json': 'beststories.json',
  '/v0/askstories.json': 'askstories.json',
  '/v0/showstories.json': 'showstories.json',
  '/v0/jobstories.json': 'jobstories.json',
};

const ITEM_RE = /^\/v0\/item\/(\w+)\.json$/;
const USER_RE = /^\/v0\/user\/([\w-]+)\.json$/;
const INJECT_500_RE = /^\/v0\/inject\/500\/\w+\.json$/;
const INJECT_SLOW_RE = /^\/v0\/inject\/slow\/\w+\.json$/;

const slowDelayMs = () => Number(process.env.MOCK_SLOW_MS ?? 200);

/**
 * Serve a fixture file with the correct Content-Type.
 * @param {import('node:http').ServerResponse} res
 * @param {string} filename - filename under test/fixtures/
 */
async function serveFixture(res, filename) {
  try {
    const data = await readFile(join(FIX_DIR, filename));
    res.statusCode = 200;
    res.setHeader('Content-Type', JSON_CT);
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 500;
    res.end(String(err));
  }
}

async function handle(req, res) {
  const url = req.url ?? '/';

  if (INJECT_500_RE.test(url) || url.startsWith('/v0/item/inject-500')) {
    res.statusCode = 500;
    res.setHeader('Content-Type', JSON_CT);
    res.end('{"error":"injected 500"}');
    return;
  }

  if (INJECT_SLOW_RE.test(url) || url.startsWith('/v0/item/slow')) {
    await new Promise((r) => setTimeout(r, slowDelayMs()));
    await serveFixture(res, 'item-1.json');
    return;
  }

  if (STATIC[url]) {
    await serveFixture(res, STATIC[url]);
    return;
  }

  const itemMatch = url.match(ITEM_RE);
  if (itemMatch) {
    await serveFixture(res, `item-${itemMatch[1]}.json`);
    return;
  }

  const userMatch = url.match(USER_RE);
  if (userMatch) {
    await serveFixture(res, `user-${userMatch[1]}.json`);
    return;
  }

  res.statusCode = 404;
  res.end();
}

/**
 * Start the mock HN server.
 * @param {number} [port=0] - 0 = OS picks a free port.
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 *
 * @example
 * const srv = await startServer(0);
 * const res = await fetch(`http://localhost:${srv.port}/v0/item/1.json`);
 * await srv.close();
 */
export async function startServer(port = 0) {
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : port;
  return {
    port: boundPort,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// CLI entry: node test/mock-server.js
const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) : null;
if (invokedPath && process.argv[1] === invokedPath) {
  const cliPort = Number(process.env.MOCK_PORT ?? 8787);
  startServer(cliPort).then((srv) => {
    // eslint-disable-next-line no-console
    console.log(`mock-server listening on http://localhost:${srv.port}/v0`);
    const shutdown = () => srv.close().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
