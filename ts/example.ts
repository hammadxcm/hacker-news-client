#!/usr/bin/env node
/**
 * Runnable example hitting the live Hacker News API.
 * @example node --experimental-strip-types example.ts
 */
import { HackerNewsClient, type Item } from './src/index.ts';

const client = new HackerNewsClient();

const topFive: Item[] = await client.topStories(5);
for (const item of topFive) {
  if (item.type === 'story') {
    console.log(`• ${item.title ?? '(untitled)'} — ${item.by ?? '?'} (${item.score ?? 0})`);
  }
}
