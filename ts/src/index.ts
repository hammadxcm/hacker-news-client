/**
 * @file Public entry point for the `@hammadxcm/hn-api-client-ts` package.
 * @example
 * import { HackerNewsClient } from '@hammadxcm/hn-api-client-ts';
 * const client = new HackerNewsClient();
 * const item = await client.item(1);
 */

export type { HackerNewsClientOptions } from './client.ts';
export { HackerNewsClient } from './client.ts';
export {
  HackerNewsError,
  HttpError,
  JsonError,
  TimeoutError,
  TransportError,
} from './errors.ts';
export type {
  Comment,
  CommentTreeNode,
  Item,
  ItemType,
  Job,
  Poll,
  PollOpt,
  Story,
  Updates,
  User,
} from './types.ts';
