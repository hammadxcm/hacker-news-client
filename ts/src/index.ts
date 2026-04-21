/**
 * @file Public entry point for the `@hacker-news/client-ts` package.
 * @example
 * import { HackerNewsClient } from '@hacker-news/client-ts';
 * const client = new HackerNewsClient();
 * const item = await client.item(1);
 */
export { HackerNewsClient } from './client.ts';
export type { HackerNewsClientOptions } from './client.ts';
export {
  HackerNewsError,
  TimeoutError,
  HttpError,
  JsonError,
  TransportError,
} from './errors.ts';
export type {
  Item,
  ItemType,
  Story,
  Comment,
  Job,
  Poll,
  PollOpt,
  User,
  Updates,
  CommentTreeNode,
} from './types.ts';
