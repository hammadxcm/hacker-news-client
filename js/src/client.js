import { HttpError, JsonError, TimeoutError, TransportError } from './errors.js';

const DEFAULT_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_USER_AGENT = 'hn-client-js/0.1.0';
const DEFAULT_STORIES_LIMIT = 30;

/**
 * @typedef {'story'|'comment'|'job'|'poll'|'pollopt'} ItemType
 *
 * @typedef {Object} Story
 * @property {'story'} type
 * @property {number} id
 * @property {string} [by]
 * @property {number} [time]
 * @property {string} [title]
 * @property {number} [score]
 * @property {number} [descendants]
 * @property {string} [url]
 * @property {string} [text]
 * @property {number[]} [kids]
 * @property {boolean} [dead]
 *
 * @typedef {Object} Comment
 * @property {'comment'} type
 * @property {number} id
 * @property {string} [by]
 * @property {number} [time]
 * @property {number} [parent]
 * @property {string} [text]
 * @property {number[]} [kids]
 * @property {boolean} [dead]
 *
 * @typedef {Object} Job
 * @property {'job'} type
 * @property {number} id
 * @property {string} [by]
 * @property {number} [time]
 * @property {string} [title]
 * @property {number} [score]
 * @property {string} [url]
 * @property {string} [text]
 * @property {boolean} [dead]
 *
 * @typedef {Object} Poll
 * @property {'poll'} type
 * @property {number} id
 * @property {string} [by]
 * @property {number} [time]
 * @property {string} [title]
 * @property {number} [score]
 * @property {number} [descendants]
 * @property {number[]} parts
 * @property {string} [text]
 * @property {number[]} [kids]
 * @property {boolean} [dead]
 *
 * @typedef {Object} PollOpt
 * @property {'pollopt'} type
 * @property {number} id
 * @property {string} [by]
 * @property {number} [time]
 * @property {number} poll
 * @property {number} [score]
 * @property {string} [text]
 *
 * @typedef {Story|Comment|Job|Poll|PollOpt} Item
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {number} created
 * @property {number} karma
 * @property {string} [about]
 * @property {number[]} [submitted]
 *
 * @typedef {Object} Updates
 * @property {number[]} items
 * @property {string[]} profiles
 *
 * @typedef {Comment & { replies: CommentTreeNode[] }} CommentTreeNode
 */

/**
 * Client for the official Hacker News Firebase API.
 *
 * All fetch methods return decoded JSON. `null` responses (including `{deleted:true}`
 * tombstones) surface as `null`. HTTP errors, timeouts, and transport failures raise
 * subclasses of {@link HackerNewsError}.
 *
 * @example
 * import { HackerNewsClient } from 'hacker-news-client';
 * const client = new HackerNewsClient();
 * const story = await client.item(1);
 * console.log(story?.title);
 */
export class HackerNewsClient {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.baseUrl]
   * @param {number} [opts.timeout] total budget in ms (connect + read + decode)
   * @param {number} [opts.concurrency] bounded fan-out for batch methods
   * @param {string} [opts.userAgent]
   * @param {typeof fetch} [opts.fetch] injectable fetch (test doubles, middleware)
   */
  constructor(opts = {}) {
    // HN_BASE="" (empty string, common in .env files) is treated as unset.
    const envBase =
      typeof process !== 'undefined' && process.env && process.env.HN_BASE
        ? process.env.HN_BASE
        : undefined;
    this.baseUrl = (opts.baseUrl ?? envBase ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // Reject non-positive timeout/concurrency rather than silently normalizing —
    // a zero timeout would never resolve; zero concurrency would return [] for
    // any non-empty ids batch. Normalize to defaults instead.
    const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
    this.timeout = typeof timeout === 'number' && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
    this.concurrency =
      typeof concurrency === 'number' && concurrency > 0 ? concurrency : DEFAULT_CONCURRENCY;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  /**
   * Low-level GET that returns decoded JSON or throws a typed error.
   * @param {string} path e.g. `/item/1.json`
   * @returns {Promise<unknown>}
   */
  async #get(path) {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new TimeoutError({ url })), this.timeout);
    try {
      let res;
      try {
        res = await this.fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': this.userAgent },
          redirect: 'follow',
        });
      } catch (err) {
        if (err instanceof TimeoutError) throw err;
        if (err?.name === 'AbortError') {
          if (ctrl.signal.reason instanceof TimeoutError) throw ctrl.signal.reason;
          throw ctrl.signal.reason ?? err;
        }
        throw new TransportError({ url, cause: err });
      }
      if (!res.ok) throw new HttpError({ url, status: res.status });
      try {
        return await res.json();
      } catch (err) {
        throw new JsonError({ url, cause: err });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch a single item. Returns `null` for unknown ids and `{deleted:true}` stubs.
   * @param {number} id
   * @returns {Promise<Item|null>}
   * @example
   * const item = await client.item(1);
   */
  async item(id) {
    const body = /** @type {any} */ (await this.#get(`/item/${id}.json`));
    if (body === null) return null;
    if (body && body.deleted === true) return null;
    return body;
  }

  /**
   * Fetch many items with bounded concurrency. Drops nulls and deleted stubs;
   * surviving items preserve their relative input order. Fails fast: the first
   * HTTP/transport error cancels siblings and propagates.
   * @param {number[]} ids
   * @returns {Promise<Item[]>}
   * @example
   * const stories = await client.items([1, 2, 3]);
   */
  async items(ids) {
    if (ids.length === 0) return [];
    const concurrency = Math.min(this.concurrency, ids.length);
    const results = new Array(ids.length);
    let cursor = 0;
    let firstError = null;

    // Each worker checks `firstError` before dequeuing the next id. Once a
    // peer has captured an error, remaining workers skip their next fetch.
    // Requests ALREADY in-flight still resolve (fetch() takes no signal here),
    // which is acceptable — the visible behavior to the caller is "raised
    // after the first error." Wiring an AbortController through would cancel
    // the in-flight sockets but is a larger refactor; deferred to v0.2 if
    // latency under pathological failure modes becomes a concern.
    const worker = async () => {
      while (true) {
        if (firstError) return;
        const i = cursor++;
        if (i >= ids.length) return;
        try {
          results[i] = await this.item(ids[i]);
        } catch (err) {
          if (!firstError) firstError = err;
          return;
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    if (firstError) throw firstError;
    return results.filter((x) => x != null);
  }

  /**
   * Fetch a user profile. Returns `null` for unknown users.
   * @param {string} username
   * @returns {Promise<User|null>}
   */
  async user(username) {
    return /** @type {User|null} */ (await this.#get(`/user/${username}.json`));
  }

  /** @returns {Promise<number>} current largest item id */
  async maxItem() {
    return /** @type {number} */ (await this.#get('/maxitem.json'));
  }

  /** @returns {Promise<Updates>} */
  async updates() {
    return /** @type {Updates} */ (await this.#get('/updates.json'));
  }

  /** @returns {Promise<number[]>} */
  async topStoryIds() {
    return /** @type {number[]} */ (await this.#get('/topstories.json'));
  }
  /** @returns {Promise<number[]>} */
  async newStoryIds() {
    return /** @type {number[]} */ (await this.#get('/newstories.json'));
  }
  /** @returns {Promise<number[]>} */
  async bestStoryIds() {
    return /** @type {number[]} */ (await this.#get('/beststories.json'));
  }
  /** @returns {Promise<number[]>} */
  async askStoryIds() {
    return /** @type {number[]} */ (await this.#get('/askstories.json'));
  }
  /** @returns {Promise<number[]>} */
  async showStoryIds() {
    return /** @type {number[]} */ (await this.#get('/showstories.json'));
  }
  /** @returns {Promise<number[]>} */
  async jobStoryIds() {
    return /** @type {number[]} */ (await this.#get('/jobstories.json'));
  }

  /**
   * @param {(() => Promise<number[]>)} fetcher
   * @param {number} limit
   * @returns {Promise<Item[]>}
   */
  async #hydrate(fetcher, limit) {
    const ids = (await fetcher()).slice(0, limit);
    return this.items(ids);
  }

  /** @param {number} [limit=30] */
  async topStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.topStoryIds(), limit);
  }
  /** @param {number} [limit=30] */
  async newStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.newStoryIds(), limit);
  }
  /** @param {number} [limit=30] */
  async bestStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.bestStoryIds(), limit);
  }
  /** @param {number} [limit=30] */
  async askStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.askStoryIds(), limit);
  }
  /** @param {number} [limit=30] */
  async showStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.showStoryIds(), limit);
  }
  /** @param {number} [limit=30] */
  async jobStories(limit = DEFAULT_STORIES_LIMIT) {
    return this.#hydrate(() => this.jobStoryIds(), limit);
  }

  /**
   * Recursively fetch a comment tree rooted at `id`. Uses one global semaphore
   * bounded by `this.concurrency`. Deleted nodes are pruned. Fails fast.
   * @param {number} id
   * @returns {Promise<CommentTreeNode | null>} root with `replies[]`; `null` if the root itself is missing/deleted.
   */
  async commentTree(id) {
    const permits = { available: this.concurrency };
    const waiters = [];
    const acquire = () =>
      new Promise((resolve) => {
        if (permits.available > 0) {
          permits.available--;
          resolve();
        } else waiters.push(resolve);
      });
    const release = () => {
      const next = waiters.shift();
      if (next) next();
      else permits.available++;
    };

    const visit = async (nodeId) => {
      await acquire();
      let node;
      try {
        node = /** @type {any} */ (await this.#get(`/item/${nodeId}.json`));
      } finally {
        release();
      }
      if (node === null || node?.deleted === true) return null;
      const childIds = Array.isArray(node.kids) ? node.kids : [];
      const children = await Promise.all(childIds.map((cid) => visit(cid)));
      return { ...node, replies: children.filter((c) => c !== null) };
    };

    return visit(id);
  }
}
