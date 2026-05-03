import { HttpError, JsonError, TimeoutError, TransportError } from './errors.ts';
import type { Comment, CommentTreeNode, Item, Updates, User } from './types.ts';

const DEFAULT_BASE_URL = 'https://hacker-news.firebaseio.com/v0';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_USER_AGENT = 'hn-client-ts/0.1.0';
const DEFAULT_STORIES_LIMIT = 30;

export interface HackerNewsClientOptions {
  readonly baseUrl?: string;
  /** Total request budget in ms (connect + read + decode). */
  readonly timeout?: number;
  /** Bounded fan-out for batch methods (default 10). */
  readonly concurrency?: number;
  readonly userAgent?: string;
  /** Injectable fetch for testing / middleware. */
  readonly fetch?: typeof fetch;
}

type IdLike = number | string;

/**
 * Strongly-typed client for the Hacker News Firebase API.
 *
 * All fetch methods return decoded JSON typed per {@link Item}, {@link User}, etc.
 * `null` responses (including `{deleted:true}` tombstones) surface as `null`.
 * HTTP errors, timeouts, and transport failures raise subclasses of {@link HackerNewsError}.
 *
 * @example
 * const client = new HackerNewsClient();
 * const item = await client.item(1);
 * if (item?.type === 'story') console.log(item.title);
 */
export class HackerNewsClient {
  readonly baseUrl: string;
  readonly timeout: number;
  readonly concurrency: number;
  readonly userAgent: string;
  private readonly _fetch: typeof fetch;

  constructor(opts: HackerNewsClientOptions = {}) {
    // HN_BASE="" (empty, common in .env files) is treated as unset.
    const envBase =
      typeof process !== 'undefined' && process.env && process.env.HN_BASE
        ? process.env.HN_BASE
        : undefined;
    this.baseUrl = (opts.baseUrl ?? envBase ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // Non-positive timeout/concurrency are replaced with defaults rather
    // than silently producing hangs (timeout ≤ 0) or empty-batch results
    // (concurrency ≤ 0).
    const timeoutIn = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    const concurrencyIn = opts.concurrency ?? DEFAULT_CONCURRENCY;
    this.timeout = timeoutIn > 0 ? timeoutIn : DEFAULT_TIMEOUT_MS;
    this.concurrency = concurrencyIn > 0 ? concurrencyIn : DEFAULT_CONCURRENCY;
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
    this._fetch = opts.fetch ?? globalThis.fetch;
  }

  private async get(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new TimeoutError({ url })), this.timeout);
    try {
      let res: Response;
      try {
        res = await this._fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': this.userAgent },
          redirect: 'follow',
        });
      } catch (err) {
        if (err instanceof TimeoutError) throw err;
        if ((err as { name?: string }).name === 'AbortError') {
          const reason = ctrl.signal.reason;
          if (reason instanceof TimeoutError) throw reason;
          throw reason ?? err;
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
   * @example const item = await client.item(1);
   */
  async item(id: IdLike): Promise<Item | null> {
    const body = (await this.get(`/item/${id}.json`)) as (Item & { deleted?: boolean }) | null;
    if (body === null) return null;
    if (body.deleted === true) return null;
    return body as Item;
  }

  /**
   * Fetch many items with bounded concurrency. Drops nulls and deleted stubs;
   * surviving items preserve their relative input order. Fails fast.
   * @example const items = await client.items([1, 2, 3]);
   */
  async items(ids: readonly IdLike[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const concurrency = Math.min(this.concurrency, ids.length);
    const results: Array<Item | null> = new Array(ids.length).fill(null);
    let cursor = 0;
    let firstError: unknown = null;

    const worker = async (): Promise<void> => {
      while (true) {
        if (firstError) return;
        const i = cursor++;
        if (i >= ids.length) return;
        try {
          results[i] = await this.item(ids[i]!);
        } catch (err) {
          if (!firstError) firstError = err;
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (firstError) throw firstError;
    return results.filter((x): x is Item => x !== null);
  }

  /** Fetch a user. Returns `null` for unknown. */
  async user(username: string): Promise<User | null> {
    return (await this.get(`/user/${username}.json`)) as User | null;
  }

  async maxItem(): Promise<number> {
    return (await this.get('/maxitem.json')) as number;
  }

  async updates(): Promise<Updates> {
    return (await this.get('/updates.json')) as Updates;
  }

  async topStoryIds(): Promise<number[]> {
    return (await this.get('/topstories.json')) as number[];
  }
  async newStoryIds(): Promise<number[]> {
    return (await this.get('/newstories.json')) as number[];
  }
  async bestStoryIds(): Promise<number[]> {
    return (await this.get('/beststories.json')) as number[];
  }
  async askStoryIds(): Promise<number[]> {
    return (await this.get('/askstories.json')) as number[];
  }
  async showStoryIds(): Promise<number[]> {
    return (await this.get('/showstories.json')) as number[];
  }
  async jobStoryIds(): Promise<number[]> {
    return (await this.get('/jobstories.json')) as number[];
  }

  private async hydrate(fetcher: () => Promise<number[]>, limit: number): Promise<Item[]> {
    const ids = (await fetcher()).slice(0, limit);
    return this.items(ids);
  }

  async topStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.topStoryIds(), limit);
  }
  async newStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.newStoryIds(), limit);
  }
  async bestStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.bestStoryIds(), limit);
  }
  async askStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.askStoryIds(), limit);
  }
  async showStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.showStoryIds(), limit);
  }
  async jobStories(limit: number = DEFAULT_STORIES_LIMIT): Promise<Item[]> {
    return this.hydrate(() => this.jobStoryIds(), limit);
  }

  /**
   * Recursively fetch a comment tree rooted at `id`. One global semaphore bounds
   * concurrency across the whole tree. Deleted nodes are pruned.
   * @example const tree = await client.commentTree(8000);
   */
  async commentTree(id: IdLike): Promise<CommentTreeNode | null> {
    const permits = { available: this.concurrency };
    const waiters: Array<() => void> = [];
    const acquire = (): Promise<void> =>
      new Promise((resolve) => {
        if (permits.available > 0) {
          permits.available--;
          resolve();
        } else waiters.push(resolve);
      });
    const release = (): void => {
      const next = waiters.shift();
      if (next) next();
      else permits.available++;
    };

    const visit = async (nodeId: IdLike): Promise<CommentTreeNode | null> => {
      await acquire();
      let node: (Comment & { deleted?: boolean }) | null;
      try {
        node = (await this.get(`/item/${nodeId}.json`)) as (Comment & { deleted?: boolean }) | null;
      } finally {
        release();
      }
      if (node === null || node.deleted === true) return null;
      const childIds = (node as unknown as { kids?: readonly number[] }).kids ?? [];
      const children = await Promise.all(childIds.map((cid) => visit(cid)));
      return {
        ...(node as Comment),
        replies: children.filter((c): c is CommentTreeNode => c !== null),
      };
    };

    return visit(id);
  }
}
