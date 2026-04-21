/**
 * @file Public entry point for the `hacker-news-client` package.
 * @example
 * import { HackerNewsClient } from 'hacker-news-client';
 * const client = new HackerNewsClient();
 * console.log(await client.item(1));
 */
export { HackerNewsClient } from './client.js';
export {
  HackerNewsError,
  HttpError,
  JsonError,
  TimeoutError,
  TransportError,
} from './errors.js';
